# Escala

Escala is a seller-support MVP for marketplace operations. It turns buyer messages into evidence-backed recommendations and presents them in a Shopee Seller Centre-inspired workspace. The interface is an original Escala design and is not affiliated with Shopee.

## Current status

The MVP includes a responsive seller inbox, synthetic support scenarios and knowledge-base data, a MongoDB persistence layer, an OpenAI Responses integration, deterministic risk policy, and seller decision audit records. External message sending and order mutation remain disabled. The smaller deterministic engine prototype and its contract tests from the repository's earlier work are preserved separately at `src/determination-engine.js`.

Development now uses this cloned Escala repository. The authorized Shop Signal migration integrates its local English checkpoint and Vietnamese triage into Escala's existing server, contracts, MongoDB thread records, and inbox components. There is one Next.js app and one database system (MongoDB). No old SQLite database or FastAPI service is used.

Verified on 2026-09-28: 51 tests pass including a real local MongoDB replica-set HTTP test, lint/typecheck/demo validation/build pass, and the production app runs locally. The API test verifies persisted recommendations and audit records across an app restart and runs the cached-analysis refresh command. Atlas connectivity, live OpenAI generation, and Vercel deployment were not verified in this clone; no credentials were copied from the old project.

## Run locally

Prerequisites: Node.js 20.19 or newer, npm, and Git. Create `.env.local` from `.env.example`, add MongoDB and OpenAI credentials, then run:

```powershell
npm install
npm run dev
```

## Verification

```powershell
npm test
npm run lint
npm run typecheck
npm run validate:demo
npm run build
```

For the full HTTP/MongoDB integration test after building (the first run may download official MongoDB binaries):

```powershell
$env:ESCALA_RUN_INTEGRATION="1"
$env:MONGOMS_DOWNLOAD_DIR=".local/mongodb-binaries"
npm test
```

Without that flag, the HTTP test is explicitly skipped. The real-model test is also explicitly skipped if model assets are missing. Integration tests use an isolated temporary MongoDB replica set, never your Atlas database, and make no OpenAI calls.

## Integrated sentiment and triage

`src/server/policy.mjs` owns inspectable routing, Vietnamese tone cues, intent detection, temporal urgency, and queue priority alongside Escala's existing recommendation policy. Accents are one language signal; Vietnamese phrases, unaccented vocabulary, teencode, and mixed text also route to Vietnamese rules. The original message is retained. Questions, requests, and factual issue reports default to neutral; explicit dissatisfaction or abuse is negative. Rule labels have no calibrated confidence. Short ambiguous messages, negation, sarcasm, and unfamiliar slang remain limitations; these rules are not general Vietnamese sentiment validation.

`src/server/sentiment.mjs` loads the local English model once per server process, using Transformers.js/ONNX on CPU with remote downloads disabled. Sentiment confidence is separate from the OpenAI candidate's recommendation confidence. Missing or malformed model assets produce an explicit unknown/unavailable result, not an invented neutral label. Hard financial or order-action rules retain authority regardless of either model's output; no message is sent and no order is changed.

MongoDB threads cache analysis when seeded. Inbox refresh changes only waiting-time priority; it does not rerun model inference. Existing databases can be explicitly refreshed with `npm run refresh:analysis` after `.env.local` is configured. That command updates analysis fields only, retaining messages and seller state; historical recommendation/audit records remain historical. Risk, temporal urgency, and attention priority are separate. Runtime analysis and evidence lookup no longer use fixture `expected*` fields as answers.

| Regression message | Route | Sentiment | Intent | Time urgency | Priority at arrival |
| --- | --- | --- | --- | --- | ---: |
| `dit me may tra tien cho tao` | Vietnamese rules | Negative | Refund | Low | 85 |
| `trả tiền cho tao` | Vietnamese rules | Neutral | Refund | Low | 70 |
| `dm may tra tien cho t` | Vietnamese rules | Negative | Refund | Low | 85 |
| `Shop refund cho minh, giao nham mau roi` | Mixed / Vietnamese rules | Neutral | Wrong item | Low | 47 |
| `shop ơi em đặt màu kem mà sao nhận màu đen vậy ạ` | Vietnamese rules | Neutral | Wrong item | Low | 47 |
| `cảm ơn shop nha hàng đẹp lắm` | Vietnamese rules | Positive | Positive feedback | Low | 5 |

The demanding refund receives a direct-payment-demand reason without requiring a negative label; the insulting version receives an abusive-language reason. Neither claims a deadline. A deadline changes temporal urgency independently. These are regression examples, not a Vietnamese accuracy estimate. A trained Vietnamese replacement needs representative real messages, independent human annotation/adjudication, and a held-out evaluation grouped by conversation/customer and near duplicates, with factual-neutral, hostile-negative, unaccented, teencode, mixed, and sarcasm slices.

## Local English model and reproducible tooling

The trained checkpoint is preserved locally at `data/models/english/source/`; the app uses its fp32 ONNX export at `data/models/english/onnx/model.onnx`. Source weights SHA256: `fe9f3a0ce17660e048ada03c4db1f26063e9ff6ff8f6657d16df5230a8993dba`. No retraining occurred during migration. Export parity on all 75 frozen rows found zero label differences and maximum logit difference `0.0000203848`; the actual Node pipeline also matched all 75 labels. Model assets and ML environments are ignored by Git, so a fresh clone needs an export from a supplied local checkpoint. The app has no runtime dependency on the old project directory.

Two raw synthetic batches live under `data/sentiment/raw/`, with audit, split, review, predictions, and comparison records under `data/sentiment/results/`. `assistant_reviewed` means assistant review of synthetic text, not real-customer verification. Raw files were preserved. The new 500-row batch has 260 neutral, 120 negative, 120 positive labels. The reproducible audit excludes one old-batch near duplicate and makes 349 train, 75 validation, and 75 test rows with seed 42. Old policy conflicts are listed for human review, not silently relabeled or used in candidate training.

| Same 75-row test | Legacy baseline | Preserved deployed model |
| --- | ---: | ---: |
| Macro F1 | 0.8286 | 0.9681 |
| Neutral recall | 0.7949 | 0.9744 |
| Negative recall | 0.7778 | 0.9444 |
| Factual neutral reports (n=11) | 5/11 | 11/11 |
| Explicit negative (n=13) | 13/13 | 13/13 |
| Clear sarcasm (n=3) | 0/3 | 3/3 |

Full confusion matrices/per-class metrics/errors are in `data/sentiment/results/test_comparison.json`. This comparison was rerun in Escala against the unchanged source weights. The synthetic sample and three sarcasm cases do not establish real-shop accuracy. `new:98` (payment question) and `new:289` (stitching criticism) remain errors and human-review candidates.

Exact migration/export commands run from Escala (the parent is reference material only):

```powershell
python -m venv .venv-ml
.venv-ml\Scripts\python.exe -m pip install -r scripts/requirements-sentiment.txt
.venv-ml\Scripts\python.exe scripts/sentiment.py prepare
.venv-ml\Scripts\python.exe scripts/sentiment.py export --source ..\checkpoints\deployed_strict_500
.venv-ml\Scripts\python.exe scripts/sentiment.py evaluate --baseline ..\checkpoints\baseline_legacy_653 --candidate data\models\english\source
```

For a future retraining, provide a local baseline checkpoint; candidate output stays separate from the runtime model:

```powershell
.venv-ml\Scripts\python.exe scripts/sentiment.py train --baseline ..\checkpoints\baseline_legacy_653 --output data/models/candidate --epochs 5 --patience 2 --batch-size 4 --gradient-accumulation 2 --max-length 96 --learning-rate 2e-5 --seed 42
.venv-ml\Scripts\python.exe scripts/sentiment.py evaluate --baseline ..\checkpoints\baseline_legacy_653 --candidate data/models/candidate
```

Training chooses validation macro F1 with early stopping and fixed seeds; test rows are never used for selection. CUDA settings use mixed precision, gradient checkpointing, and small batches suitable for the intended 4 GB GPU; CPU fallback is supported. Export separately only after reviewing evaluation. The fp32 runtime model and native ONNX libraries are large: serverless packaging/cold starts need separate verification before Vercel deployment. Neither Vercel deployment nor a new training run is claimed here.

## Project docs

- [Product definition](docs/PRODUCT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Deterministic policy](docs/POLICY.md)
- [RAG knowledge base](docs/RAG-KNOWLEDGE-BASE.md)
- [Demo script](docs/DEMO-SCRIPT.md)
- [Setup guide](docs/SETUP.md)
- [Shopee Seller Centre design references](docs/DESIGN_REFERENCES_SHOPEE.md)
- [Earlier determination-engine contract](docs/DETERMINATION-ENGINE.md)
- [Migration map, files, and exclusions](docs/DECISIONS.md#2026-09-28--use-the-cloned-escala-repository)

Escala does not integrate with Shopee, send customer messages, mutate marketplace orders, or reuse DOCRELAY/SAND assets. Demo data is synthetic. Recommendation accuracy and seller trust remain unvalidated.
