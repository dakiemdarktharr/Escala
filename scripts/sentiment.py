import csv
import hashlib
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path
import json
from collections import Counter
import argparse
import os
import random
import torch
from torch.utils.data import DataLoader, Dataset
from transformers import AutoModelForSequenceClassification, AutoTokenizer

"""Escala local English model tooling: prepare, train, evaluate, export.
Adapted from the authorized Shop Signal reference; no runtime API or database.
"""

LABELS = ("negative", "neutral", "positive")
REQUIRED_COLUMNS = {"text", "sentiment", "issue_type", "context", "source", "review_status"}


@dataclass(frozen=True)
class Row:
    batch: str
    line: int
    text: str
    label: str
    issue_type: str
    context: str
    source: str
    review_status: str
    original_split: str

    @property
    def row_id(self) -> str:
        return f"{self.batch}:{self.line}"

    @property
    def normalized(self) -> str:
        return normalize(self.text)


def normalize(text: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", text.casefold()))


def load_rows(path: Path, batch: str) -> tuple[list[Row], list[dict]]:
    rows, invalid = [], []
    with path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        missing = REQUIRED_COLUMNS - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"{path.name} missing columns: {sorted(missing)}")
        for line, raw in enumerate(reader, start=2):
            text = (raw.get("text") or "").strip()
            label = (raw.get("sentiment") or "").strip().lower()
            reasons = []
            if not text:
                reasons.append("blank_text")
            if label not in LABELS:
                reasons.append("invalid_label")
            if len(text) > 4000:
                reasons.append("text_over_4000")
            if reasons:
                invalid.append({"row_id": f"{batch}:{line}", "reasons": reasons, "text": text, "label": label})
                continue
            rows.append(Row(batch, line, text, label, (raw.get("issue_type") or "").strip(),
                            (raw.get("context") or "").strip(), (raw.get("source") or "").strip(),
                            (raw.get("review_status") or "").strip(), (raw.get("split") or "").strip()))
    return rows, invalid


def near_duplicate(a: Row, b: Row) -> bool:
    if a.normalized == b.normalized:
        return True
    left, right = a.normalized, b.normalized
    if not left or not right or min(len(left), len(right)) / max(len(left), len(right)) < .72:
        return False
    tokens_a, tokens_b = set(left.split()), set(right.split())
    jaccard = len(tokens_a & tokens_b) / len(tokens_a | tokens_b)
    if jaccard >= .82 and min(len(tokens_a), len(tokens_b)) >= 5:
        return True
    if jaccard < .55:
        return False
    matcher = SequenceMatcher(None, left, right, autojunk=False)
    return matcher.quick_ratio() >= .87 and matcher.ratio() >= .87


def candidate_pairs(rows: list[Row]):
    """Token-indexed candidate pairs; only shared substantive tokens can match."""
    index: dict[str, list[int]] = defaultdict(list)
    exact_index: dict[str, list[int]] = defaultdict(list)
    seen = set()
    for i, row in enumerate(rows):
        tokens = set(row.normalized.split())
        candidates = set(exact_index[row.normalized])
        for token in tokens:
            if len(token) >= 4:
                candidates.update(index[token])
        for j in candidates:
            pair = (j, i)
            if pair not in seen:
                seen.add(pair)
                if near_duplicate(rows[j], row):
                    yield rows[j], row
        for token in tokens:
            if len(token) >= 4:
                index[token].append(i)
        exact_index[row.normalized].append(i)


def audit(old_rows: list[Row], new_rows: list[Row]) -> dict:
    all_rows = old_rows + new_rows
    pairs = []
    for left, right in candidate_pairs(all_rows):
        pairs.append({"left": left.row_id, "right": right.row_id,
                      "kind": "exact" if left.normalized == right.normalized else "near",
                      "conflict": left.label != right.label,
                      "left_label": left.label, "right_label": right.label,
                      "left_text": left.text, "right_text": right.text})
    return {
        "old_count": len(old_rows), "new_count": len(new_rows),
        "old_labels": dict(Counter(row.label for row in old_rows)),
        "new_labels": dict(Counter(row.label for row in new_rows)),
        "old_splits": dict(Counter(row.original_split for row in old_rows)),
        "pairs": pairs,
    }


class UnionFind:
    def __init__(self, ids: list[str]):
        self.parent = {value: value for value in ids}

    def find(self, value: str) -> str:
        while self.parent[value] != value:
            self.parent[value] = self.parent[self.parent[value]]
            value = self.parent[value]
        return value

    def union(self, left: str, right: str) -> None:
        a, b = self.find(left), self.find(right)
        if a != b:
            self.parent[max(a, b)] = min(a, b)


def stable_hash(value: str, seed: int) -> int:
    return int.from_bytes(hashlib.sha256(f"{seed}:{value}".encode()).digest()[:8], "big")


def make_splits(old_rows: list[Row], new_rows: list[Row], audit_result: dict, seed: int = 42) -> list[dict]:
    """Split new-batch duplicate components; old-overlap groups are excluded."""
    by_id = {row.row_id: row for row in old_rows + new_rows}
    new_ids = {row.row_id for row in new_rows}
    groups = UnionFind(list(new_ids))
    for pair in audit_result["pairs"]:
        if pair["left"] in new_ids and pair["right"] in new_ids:
            groups.union(pair["left"], pair["right"])
    members: dict[str, list[Row]] = defaultdict(list)
    for row in new_rows:
        members[groups.find(row.row_id)].append(row)

    old_overlap = set()
    for pair in audit_result["pairs"]:
        left, right = pair["left"], pair["right"]
        if (left in new_ids) != (right in new_ids):
            old_overlap.add(left if left in new_ids else right)
    old_overlap_groups = {groups.find(row_id) for row_id in old_overlap}

    # Label-conflicting near duplicates cannot be trusted for training/evaluation.
    conflicting_groups = set()
    for group_id, group_rows in members.items():
        if len({row.label for row in group_rows}) > 1:
            conflicting_groups.add(group_id)

    eligible = [group for group in members if group not in old_overlap_groups and group not in conflicting_groups]
    # Group-aware stratification by majority label, with deterministic ordering.
    by_label: dict[str, list[str]] = defaultdict(list)
    for group_id in eligible:
        counts = Counter(row.label for row in members[group_id])
        by_label[counts.most_common(1)[0][0]].append(group_id)
    assignment = {}
    for label in LABELS:
        ordered = sorted(by_label[label], key=lambda group: stable_hash(group, seed))
        total = sum(len(members[group]) for group in ordered)
        test_target, val_target = round(total * .15), round(total * .15)
        counts = {"test": 0, "validation": 0, "train": 0}
        for group in ordered:
            split = "test" if counts["test"] < test_target else "validation" if counts["validation"] < val_target else "train"
            assignment[group] = split
            counts[split] += len(members[group])

    output = []
    for row in new_rows:
        group = groups.find(row.row_id)
        if group in conflicting_groups:
            split, reason = "exclude", "conflicting_labels_within_near_duplicate_group"
        elif group in old_overlap_groups:
            split, reason = "exclude", "near_duplicate_of_old_data"
        else:
            split, reason = assignment[group], ""
        output.append({"row_id": row.row_id, "split": split, "reason": reason,
                       "group": group, "label": row.label, "text": row.text,
                       "issue_type": row.issue_type, "context": row.context,
                       "source": row.source, "review_status": row.review_status})
    return output



ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "sentiment" / "results"
REVIEW_IDS = {
    "old:11": "Factual missing-item report labeled negative under old policy; likely neutral under strict policy.",
    "old:15": "Factual missing-adapter report labeled negative; action need is separate from sentiment.",
    "old:20": "Broken item and missing padding, but no explicit emotion; could be neutral factual report.",
    "old:31": "Delayed order reported as negative without clear dissatisfaction wording.",
    "new:346": "Sarcastic positive opener; human confirmation of tone would help.",
    "new:352": "Sarcastic complaint; human confirmation of tone would help.",
    "new:356": "Sarcastic complaint; review whether intended negative tone is unambiguous.",
    "new:357": "Sarcastic complaint; human confirmation of tone would help.",
    "new:98": "Neutral payment-method question misclassified as negative by the candidate; confirm strict-policy label.",
    "new:289": "Explicit criticism misclassified as positive by the candidate; confirm negative label.",
    "new:75": "Factual missing-package report misclassified as negative by the baseline; confirm neutral label.",
    "new:77": "Factual tracking report misclassified as negative by the baseline; confirm neutral label.",
}


def write_csv(path: Path, rows: list[dict], fields: list[str]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def prepare() -> None:
    old, old_invalid = load_rows(ROOT / "data" / "sentiment" / "raw" / "653_dev.csv", "old")
    new, new_invalid = load_rows(ROOT / "data" / "sentiment" / "raw" / "shop_sentiment_strict_500.csv", "new")
    result = audit(old, new)
    manifest = make_splits(old, new, result)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    write_csv(OUTPUT / "duplicate_pairs.csv", result["pairs"],
              ["left", "right", "kind", "conflict", "left_label", "right_label", "left_text", "right_text"])
    write_csv(OUTPUT / "split_manifest.csv", manifest,
              ["row_id", "split", "reason", "group", "label", "text", "issue_type", "context", "source", "review_status"])
    by_id = {row.row_id: row for row in old + new}
    review = [{"row_id": row_id, "current_label": by_id[row_id].label,
               "original_split": by_id[row_id].original_split,
               "text": by_id[row_id].text, "review_reason": reason}
              for row_id, reason in REVIEW_IDS.items()]
    write_csv(OUTPUT / "human_review.csv", review,
              ["row_id", "current_label", "original_split", "text", "review_reason"])
    report = {key: value for key, value in result.items() if key != "pairs"}
    report.update({
        "raw_sha256": {
            "old": hashlib.sha256((ROOT / "data/sentiment/raw/653_dev.csv").read_bytes()).hexdigest(),
            "new": hashlib.sha256((ROOT / "data/sentiment/raw/shop_sentiment_strict_500.csv").read_bytes()).hexdigest(),
        },
        "old_invalid": old_invalid, "new_invalid": new_invalid,
        "exact_pair_count": sum(pair["kind"] == "exact" for pair in result["pairs"]),
        "near_pair_count": sum(pair["kind"] == "near" for pair in result["pairs"]),
        "conflicting_pair_count": sum(pair["conflict"] for pair in result["pairs"]),
        "cross_batch_pair_count": sum(pair["left"].split(":")[0] != pair["right"].split(":")[0] for pair in result["pairs"]),
        "split_counts": dict(Counter(row["split"] for row in manifest)),
        "split_labels": {split: dict(Counter(row["label"] for row in manifest if row["split"] == split))
                         for split in ("train", "validation", "test", "exclude")},
        "exclusion_reasons": dict(Counter(row["reason"] for row in manifest if row["split"] == "exclude")),
        "human_review_count": len(review),
        "review_statuses": {"old": dict(Counter(row.review_status for row in old)),
                            "new": dict(Counter(row.review_status for row in new))},
        "source_values": {"old": dict(Counter(row.source for row in old)),
                          "new": dict(Counter(row.source for row in new))},
        "notes": [
            "assistant_reviewed is an assistant review marker, not real-customer verification.",
            "Old labels used a different policy and old rows are excluded from candidate training.",
            "Near duplicate means normalized text similarity >=0.87 with token overlap or token Jaccard >=0.82.",
            "Any new group near an old row is excluded from train/validation/test to protect the final comparison.",
        ],
    })
    (OUTPUT / "audit.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({key: report[key] for key in ["old_count", "new_count", "old_labels", "new_labels", "exact_pair_count", "near_pair_count", "conflicting_pair_count", "cross_batch_pair_count", "split_counts", "split_labels", "exclusion_reasons"]}, indent=2))





LABEL2ID = {label: index for index, label in enumerate(LABELS)}


class SentimentDataset(Dataset):
    def __init__(self, rows: list[dict]):
        self.rows = rows

    def __len__(self) -> int:
        return len(self.rows)

    def __getitem__(self, index: int) -> tuple[str, int]:
        row = self.rows[index]
        return row["text"], LABEL2ID[row["label"]]


def macro_f1(truth: list[int], predicted: list[int]) -> float:
    scores = []
    for label in range(3):
        tp = sum(a == label and b == label for a, b in zip(truth, predicted))
        fp = sum(a != label and b == label for a, b in zip(truth, predicted))
        fn = sum(a == label and b != label for a, b in zip(truth, predicted))
        precision = tp / (tp + fp) if tp + fp else 0
        recall = tp / (tp + fn) if tp + fn else 0
        scores.append(2 * precision * recall / (precision + recall) if precision + recall else 0)
    return sum(scores) / len(scores)


def load_manifest(path: Path) -> tuple[list[dict], list[dict]]:
    with path.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    groups = {}
    for row in rows:
        if row["split"] not in {"train", "validation", "test", "exclude"}:
            raise ValueError(f"Invalid split: {row['split']}")
        previous = groups.setdefault(row["group"], row["split"])
        if previous != row["split"]:
            raise ValueError("A near-duplicate group crosses splits")
    train = [row for row in rows if row["split"] == "train"]
    validation = [row for row in rows if row["split"] == "validation"]
    if not train or not validation:
        raise ValueError("Training and validation splits must be nonempty")
    return train, validation


def evaluate_validation(model, loader, device) -> tuple[float, float]:
    model.eval()
    truth, predicted = [], []
    total_loss = 0.0
    with torch.inference_mode():
        for batch in loader:
            labels = batch.pop("labels").to(device)
            tokens = {key: value.to(device) for key, value in batch.items()}
            output = model(**tokens, labels=labels)
            total_loss += float(output.loss.item()) * len(labels)
            truth.extend(labels.cpu().tolist())
            predicted.extend(output.logits.argmax(dim=1).cpu().tolist())
    return macro_f1(truth, predicted), total_loss / len(truth)


def train() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, default=ROOT / "data/sentiment/results/split_manifest.csv")
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=ROOT / "data/models/candidate")
    parser.add_argument("--epochs", type=int, default=5)
    parser.add_argument("--patience", type=int, default=2)
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--gradient-accumulation", type=int, default=2)
    parser.add_argument("--max-length", type=int, default=96)
    parser.add_argument("--learning-rate", type=float, default=2e-5)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    if args.output.resolve() in {(ROOT / "data/models/english").resolve(), (ROOT / "data/models/english/source").resolve()}:
        raise ValueError("Candidate output must not overwrite the deployed model")
    if args.batch_size < 1 or args.gradient_accumulation < 1 or args.epochs < 1:
        raise ValueError("Batch size, accumulation, and epochs must be positive")

    random.seed(args.seed)
    torch.manual_seed(args.seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(args.seed)
    else:
        torch.set_num_threads(min(4, os.cpu_count() or 1))
    torch.use_deterministic_algorithms(True, warn_only=True)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    train_rows, validation_rows = load_manifest(args.manifest)
    tokenizer = AutoTokenizer.from_pretrained(args.baseline, local_files_only=True)
    model = AutoModelForSequenceClassification.from_pretrained(args.baseline, local_files_only=True)
    if {str(key): value for key, value in model.config.id2label.items()} != {str(i): name for i, name in enumerate(LABELS)}:
        raise ValueError("Baseline checkpoint label mapping differs from negative/neutral/positive")
    if device.type == "cuda":
        model.gradient_checkpointing_enable()
    model.to(device)

    def collate(batch):
        texts, labels = zip(*batch)
        tokens = tokenizer(list(texts), padding=True, truncation=True, max_length=args.max_length, return_tensors="pt")
        tokens["labels"] = torch.tensor(labels, dtype=torch.long)
        return tokens

    train_loader = DataLoader(SentimentDataset(train_rows), batch_size=args.batch_size, shuffle=True,
                              collate_fn=collate, generator=torch.Generator().manual_seed(args.seed))
    validation_loader = DataLoader(SentimentDataset(validation_rows), batch_size=args.batch_size * 2,
                                   shuffle=False, collate_fn=collate)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.learning_rate)
    scaler = torch.amp.GradScaler("cuda", enabled=device.type == "cuda")
    best_f1, no_improvement, history = -1.0, 0, []
    args.output.mkdir(parents=True, exist_ok=True)
    print(f"Device: {device}; train={len(train_rows)} validation={len(validation_rows)}; labels={dict(Counter(row['label'] for row in train_rows))}", flush=True)
    for epoch in range(1, args.epochs + 1):
        model.train()
        optimizer.zero_grad(set_to_none=True)
        total_loss = 0.0
        for step, batch in enumerate(train_loader, start=1):
            labels = batch.pop("labels").to(device)
            tokens = {key: value.to(device) for key, value in batch.items()}
            with torch.amp.autocast("cuda", enabled=device.type == "cuda"):
                loss = model(**tokens, labels=labels).loss
            total_loss += float(loss.item()) * len(labels)
            scaler.scale(loss / args.gradient_accumulation).backward()
            if step % args.gradient_accumulation == 0 or step == len(train_loader):
                scaler.unscale_(optimizer)
                torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
                scaler.step(optimizer)
                scaler.update()
                optimizer.zero_grad(set_to_none=True)
        val_f1, val_loss = evaluate_validation(model, validation_loader, device)
        record = {"epoch": epoch, "train_loss": round(total_loss / len(train_rows), 5),
                  "validation_loss": round(val_loss, 5), "validation_macro_f1": round(val_f1, 5)}
        history.append(record)
        print(json.dumps(record), flush=True)
        if val_f1 > best_f1 + 1e-6:
            best_f1, no_improvement = val_f1, 0
            model.save_pretrained(args.output)
            tokenizer.save_pretrained(args.output)
            print(f"Saved validation-best candidate at epoch {epoch}", flush=True)
        else:
            no_improvement += 1
            if no_improvement >= args.patience:
                print("Early stopping", flush=True)
                break
    manifest_hash = hashlib.sha256(args.manifest.read_bytes()).hexdigest()
    (args.output / "training_run.json").write_text(json.dumps({
        "seed": args.seed, "device": str(device), "baseline": str(args.baseline.relative_to(ROOT) if args.baseline.is_relative_to(ROOT) else args.baseline),
        "manifest_sha256": manifest_hash, "train_count": len(train_rows),
        "validation_count": len(validation_rows), "batch_size": args.batch_size,
        "gradient_accumulation": args.gradient_accumulation, "max_length": args.max_length,
        "learning_rate": args.learning_rate, "epochs_requested": args.epochs,
        "patience": args.patience, "history": history, "best_validation_macro_f1": round(best_f1, 5),
    }, indent=2), encoding="utf-8")






PROBLEM_ISSUES = {"wrong_variant", "missing_item", "damage", "product_quality", "shipping_delay", "payment", "packaging", "listing_mismatch"}
EXPLICIT_NEGATIVE = re.compile(r"\b(upset|unacceptable|poor|frustrat\w*|can't believe|stressful|careless|hassle|irritat\w*|not happy|upsetting|disappoint\w*|ridiculous|losing patience)\b", re.I)
SARCASM = re.compile(r"^(great|perfect|awesome|fantastic|nice|love)\b", re.I)


def sha256(path: Path) -> str:
    hash_value = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            hash_value.update(block)
    return hash_value.hexdigest()


def predict(checkpoint: Path, rows: list[dict], device: torch.device, batch_size: int = 16) -> list[dict]:
    tokenizer = AutoTokenizer.from_pretrained(checkpoint, local_files_only=True)
    model = AutoModelForSequenceClassification.from_pretrained(checkpoint, local_files_only=True).to(device)
    model.eval()
    if tuple(model.config.id2label[i] for i in range(3)) != LABELS:
        raise ValueError(f"Unexpected label mapping in {checkpoint}")
    output = []
    with torch.inference_mode():
        for offset in range(0, len(rows), batch_size):
            batch = rows[offset:offset + batch_size]
            tokens = tokenizer([row["text"] for row in batch], padding=True, truncation=True, max_length=128, return_tensors="pt").to(device)
            probabilities = model(**tokens).logits.softmax(dim=1)
            confidence, predicted = probabilities.max(dim=1)
            output.extend({"label": LABELS[int(label)], "confidence": round(float(prob), 4)}
                          for label, prob in zip(predicted.cpu(), confidence.cpu()))
    del model
    if device.type == "cuda":
        torch.cuda.empty_cache()
    return output


def metrics(rows: list[dict], predictions: list[dict]) -> dict:
    matrix = [[0 for _ in LABELS] for _ in LABELS]
    label_to_id = {label: i for i, label in enumerate(LABELS)}
    for row, result in zip(rows, predictions):
        matrix[label_to_id[row["label"]]][label_to_id[result["label"]]] += 1
    per_class = {}
    for i, label in enumerate(LABELS):
        tp = matrix[i][i]
        support = sum(matrix[i])
        predicted_count = sum(matrix[j][i] for j in range(3))
        precision = tp / predicted_count if predicted_count else 0
        recall = tp / support if support else 0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0
        per_class[label] = {"precision": round(precision, 4), "recall": round(recall, 4),
                            "f1": round(f1, 4), "support": support}

    slices = {
        "factual_problem_neutral": [i for i, row in enumerate(rows) if row["label"] == "neutral" and row["issue_type"] in PROBLEM_ISSUES and "?" not in row["text"]],
        "explicit_negative": [i for i, row in enumerate(rows) if row["label"] == "negative" and EXPLICIT_NEGATIVE.search(row["text"]) and not SARCASM.search(row["text"])],
        "clear_sarcasm_negative": [i for i, row in enumerate(rows) if row["label"] == "negative" and SARCASM.search(row["text"])],
    }
    slice_metrics = {}
    for name, indices in slices.items():
        correct = sum(predictions[i]["label"] == rows[i]["label"] for i in indices)
        slice_metrics[name] = {"size": len(indices), "correct": correct,
                               "accuracy": round(correct / len(indices), 4) if indices else None,
                               "row_ids": [rows[i]["row_id"] for i in indices]}
    errors = [{"row_id": row["row_id"], "text": row["text"], "true": row["label"],
               "predicted": predictions[i]["label"], "confidence": predictions[i]["confidence"]}
              for i, row in enumerate(rows) if row["label"] != predictions[i]["label"]]
    return {"confusion_matrix_labels": LABELS, "confusion_matrix": matrix,
            "per_class": per_class, "macro_f1": round(sum(item["f1"] for item in per_class.values()) / 3, 4),
            "accuracy": round(sum(matrix[i][i] for i in range(3)) / len(rows), 4),
            "slices": slice_metrics, "errors": errors}


def evaluate() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, default=ROOT / "data/sentiment/results/split_manifest.csv")
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--candidate", type=Path, default=ROOT / "data/models/candidate")
    parser.add_argument("--output", type=Path, default=ROOT / "data/sentiment/results/test_comparison.json")
    args = parser.parse_args()
    with args.manifest.open(newline="", encoding="utf-8") as handle:
        manifest = list(csv.DictReader(handle))
    test_rows = [row for row in manifest if row["split"] == "test"]
    if not test_rows or any(row["source"] != "synthetic" for row in test_rows):
        raise ValueError("Unexpected or empty held-out test split")
    old, invalid = load_rows(ROOT / "data/sentiment/raw/653_dev.csv", "old")
    if invalid:
        raise ValueError("Old dataset has invalid rows; rerun the audit")
    new, invalid = load_rows(ROOT / "data/sentiment/raw/shop_sentiment_strict_500.csv", "new")
    if invalid:
        raise ValueError("New dataset has invalid rows; rerun the audit")
    by_id = {row.row_id: row for row in new}
    for row in test_rows:
        if any(near_duplicate(by_id[row["row_id"]], old_row) for old_row in old):
            raise ValueError(f"Test leakage against old data: {row['row_id']}")
    if {row["group"] for row in test_rows} & {row["group"] for row in manifest if row["split"] in {"train", "validation"}}:
        raise ValueError("Near-duplicate group crosses split boundary")
    torch.set_num_threads(4)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    baseline_predictions = predict(args.baseline, test_rows, device)
    candidate_predictions = predict(args.candidate, test_rows, device)
    baseline_metrics = metrics(test_rows, baseline_predictions)
    candidate_metrics = metrics(test_rows, candidate_predictions)
    result = {
        "test_count": len(test_rows), "test_manifest_sha256": sha256(args.manifest),
        "baseline_checkpoint": str(args.baseline.relative_to(ROOT) if args.baseline.is_relative_to(ROOT) else args.baseline), "baseline_weights_sha256": sha256(args.baseline / "model.safetensors"),
        "candidate_checkpoint": str(args.candidate.relative_to(ROOT) if args.candidate.is_relative_to(ROOT) else args.candidate), "candidate_weights_sha256": sha256(args.candidate / "model.safetensors"),
        "baseline": baseline_metrics, "candidate": candidate_metrics,
        "limits": "Synthetic assistant-reviewed data; small slices, especially sarcasm. Metrics are not real-shop accuracy estimates.",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    with (args.output.parent / "test_predictions.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["row_id", "text", "true", "issue_type", "baseline", "baseline_confidence", "candidate", "candidate_confidence"])
        writer.writeheader()
        for row, baseline, candidate in zip(test_rows, baseline_predictions, candidate_predictions):
            writer.writerow({"row_id": row["row_id"], "text": row["text"], "true": row["label"],
                             "issue_type": row["issue_type"], "baseline": baseline["label"],
                             "baseline_confidence": baseline["confidence"], "candidate": candidate["label"],
                             "candidate_confidence": candidate["confidence"]})
    for name, values in (("baseline", baseline_metrics), ("candidate", candidate_metrics)):
        print(json.dumps({"checkpoint": name, "macro_f1": values["macro_f1"],
                          "neutral_recall": values["per_class"]["neutral"]["recall"],
                          "negative_recall": values["per_class"]["negative"]["recall"],
                          "slices": values["slices"], "confusion_matrix": values["confusion_matrix"]}, indent=2))


def export() -> None:
    """Export for Escala's Node server and verify numerical equivalence, not tune."""
    import shutil
    import numpy as np
    import onnxruntime as ort
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=ROOT / "data/models/english")
    parser.add_argument("--manifest", type=Path, default=ROOT / "data/sentiment/results/split_manifest.csv")
    args = parser.parse_args()
    if args.source.resolve() == args.output.resolve():
        raise ValueError("Export output must differ from source")
    source_hash = sha256(args.source / "model.safetensors")
    tokenizer = AutoTokenizer.from_pretrained(args.source, local_files_only=True)
    model = AutoModelForSequenceClassification.from_pretrained(args.source, local_files_only=True, attn_implementation="eager").eval()
    if tuple(model.config.id2label[i] for i in range(3)) != LABELS:
        raise ValueError("Unexpected checkpoint label mapping")
    torch.set_num_threads(4)
    args.output.mkdir(parents=True, exist_ok=True)
    source_copy = args.output / "source"
    source_copy.mkdir(exist_ok=True)
    for file in args.source.iterdir():
        if file.is_file(): shutil.copy2(file, source_copy / file.name)
    tokenizer.save_pretrained(args.output)
    model.config.save_pretrained(args.output)
    onnx_dir = args.output / "onnx"
    onnx_dir.mkdir(exist_ok=True)
    class Logits(torch.nn.Module):
        def __init__(self):
            super().__init__()
            self.classifier = model
        def forward(self, input_ids, attention_mask):
            return self.classifier(input_ids=input_ids, attention_mask=attention_mask).logits
    sample = tokenizer("A factual buyer message.", return_tensors="pt")
    # Explicit eager/TorchScript export supports this local DistilBERT checkpoint;
    # the artifact is then checked against every frozen held-out row.
    torch.onnx.export(Logits().eval(), (sample["input_ids"], sample["attention_mask"]),
        str(onnx_dir / "model.onnx"), input_names=["input_ids", "attention_mask"], output_names=["logits"],
        dynamic_axes={"input_ids": {0: "batch", 1: "sequence"}, "attention_mask": {0: "batch", 1: "sequence"}, "logits": {0: "batch"}},
        opset_version=17, dynamo=False)
    model.eval()
    options = ort.SessionOptions()
    options.intra_op_num_threads = 4
    session = ort.InferenceSession(str(onnx_dir / "model.onnx"), options, providers=["CPUExecutionProvider"])
    with args.manifest.open(newline="", encoding="utf-8") as handle:
        rows = [row for row in csv.DictReader(handle) if row["split"] == "test"]
    if not rows: raise ValueError("No frozen rows for export parity verification")
    disagreements, max_error, cases = [], 0.0, []
    for row in rows:
        tokens = tokenizer(row["text"], return_tensors="pt", truncation=True, max_length=128)
        with torch.inference_mode(): expected = model(**tokens).logits.numpy()
        input_names = {item.name for item in session.get_inputs()}
        actual = session.run(None, {key: value.numpy() for key, value in tokens.items() if key in input_names})[0]
        max_error = max(max_error, float(np.max(np.abs(expected - actual))))
        if expected.argmax() != actual.argmax(): disagreements.append(row["row_id"])
        cases.append({"row_id": row["row_id"], "text": row["text"], "label": LABELS[int(expected.argmax())],
                      "confidence": float(torch.tensor(expected).softmax(dim=1).max())})
    if disagreements or max_error > 1e-4:
        raise ValueError(f"ONNX parity failed: labels={disagreements}; max logit difference={max_error}")
    record = {"source_weights_sha256": source_hash, "onnx_sha256": sha256(onnx_dir / "model.onnx"),
        "format": "ONNX fp32", "label_mapping": list(LABELS), "held_out_rows": len(rows),
        "label_disagreements": disagreements, "max_logit_difference": max_error,
        "test_manifest_sha256": sha256(args.manifest), "note": "Conversion parity check only; no training or test tuning."}
    (args.output / "export.json").write_text(json.dumps(record, indent=2), encoding="utf-8")
    (ROOT / "data/sentiment/results/export_parity.json").write_text(json.dumps({**record, "cases": cases}, indent=2), encoding="utf-8")
    print(json.dumps(record, indent=2))


if __name__ == "__main__":
    import sys
    commands = {"prepare": prepare, "train": train, "evaluate": evaluate, "export": export}
    if len(sys.argv) < 2 or sys.argv[1] not in commands:
        raise SystemExit("Usage: python scripts/sentiment.py prepare|train|evaluate|export [options]")
    command = sys.argv.pop(1)
    commands[command]()


