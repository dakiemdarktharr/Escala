# Escala

Escala is a seller-support MVP for marketplace operations. It turns buyer messages into evidence-backed recommendations and presents them in a Shopee Seller Centre-inspired workspace. The interface is an original Escala design and is not affiliated with Shopee.

## Current status

The MVP includes a responsive seller inbox, synthetic support scenarios and knowledge-base data, a MongoDB persistence layer, an OpenAI Responses integration, deterministic risk policy, and seller decision audit records. External message sending and order mutation remain disabled. The smaller deterministic engine prototype and its contract tests from the repository's earlier work are preserved separately at `src/determination-engine.js`.

Development now uses this cloned Escala repository. The authorized Shop Signal migration integrates its local English checkpoint and Vietnamese triage into Escala's existing server, contracts, MongoDB thread records, and inbox components. There is one Next.js app and one database system (MongoDB). No old SQLite database or FastAPI service is used.

Verified on 2026-09-28: 60 tests pass including a real local MongoDB replica-set HTTP test, lint/typecheck/demo validation/build pass, and the production app runs locally. The API test verifies persisted seller replies, recommendations and audit records across an app restart and runs the cached-analysis refresh command. Atlas connectivity, live OpenAI generation, and Vercel deployment were not verified in this clone; no credentials were copied from the old project.

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

Without that flag, the HTTP test is explicitly skipped. The real-model test is also explicitly skipped if model assets are missing. Integration tests use an isolated temporary MongoDB replica set, never your Atlas database, and use a local OpenAI Responses protocol stub for confidence/adapter tests; no real OpenAI calls are made.

## Messaging interface and themes

The existing inbox now uses a conversation list, active chat and context sidebar. Queue rows show the latest persisted message/time, unread state and at most two status indicators. The compact header keeps priority, sentiment and intent visible; View analysis opens full buyer-message analysis, evidence, policy and audit details. Queue ordering and original buyer analysis inputs remain unchanged.

Message history scrolls separately from the bottom reply dock. Buyer bubbles are neutral and left-aligned; sent seller bubbles use a soft brand tint on the right. The copilot suggestion sits above the always-visible multiline composer. Its draft is distinct from sent messages, with review/approval controls retained. Edit preserves suggestion provenance, manual replies remain available, and Ctrl/Cmd+Enter sends only when the same approval checks permit the Send button. Enter makes a new line. Longer suggestions/details use progressive disclosure rather than replacing the chat.

The top-bar Color theme control offers System, Light and Dark. Preference persists in localStorage (`escala-theme`); System follows OS changes. An inline script in the existing root layout applies the resolved theme before body paint. Storage failures leave a working session theme. The existing CSS variables define both palettes; no theme dependency/provider or second design system was added.

| Token role | Light | Dark |
| --- | --- | --- |
| Background | #F7F7F5 | #0F1115 |
| Primary surface | #FFFFFF | #161A20 |
| Secondary surface | #F1F2F4 | #1C222B |
| Raised surface | Secondary surface | #222936 |
| Border | #E5E7EB | #2C3442 |
| Primary text | #111827 | #F3F4F6 |
| Secondary text | #6B7280 | #9CA3AF |
| Brand | #F05A28 | #FF6B3D |
| Brand hover | #D94E21 | #FF7C54 |
| Soft brand tint | #FFF1EB | Low-opacity brand mix |
| Information | #2563EB | #60A5FA |
| Review/warning | #D97706 | #FBBF24 |
| Risk/negative | #DC2626 | #F87171 |
| Success/positive | #16A34A | #4ADE80 |

Semantic colors appear in small labeled indicators, icons and subtle tints. Large surfaces stay neutral. Contrast variants handle small text; primary orange buttons use readable foregrounds. Existing queue/context drawers support narrower screens without duplicating the inbox. Models, confidence thresholds, deterministic risk rules and priority weights were not redesigned.

Browser verification for this redesign covered light/dark preference and reload persistence, System resolution against the current OS preference, conversation switching, urgent and negative cases, order/evidence/context tabs, edited and manual multiline sends, sensitive-action approval, original/final audit text, long-message wrapping and independently scrolling copilot details. CSS viewports 1440×900, 900×650, and 390×600 were exercised. Local production delivery remained simulated. Screenshots are saved in ignored `.local/verification/messaging-{light,dark,mobile}.png`.

Remaining limits: local suggestions are reviewed templates with unavailable confidence because no OpenAI key was configured. Live AI and actual marketplace sends were not tested. Physical-device keyboard behavior, comprehensive assistive-technology testing and confidence calibration still need evaluation. Very short windows prioritize the composer and can require scrolling within the copilot. Theme bootstrap reduces wrong-theme flash; a content-security policy that blocks inline scripts would need a nonce or hash. The in-app browser's screenshot capture showed scaling/clipping artifacts; DOM geometry and interactive checks verified layout/controls, but those images are imperfect visual evidence.

## Seller reply workflow

Every conversation has a manual reply composer. Suggest a reply shows an operational next step (for example, Review refund request), a buyer-facing draft, independent risk/confidence, evidence, source and delivery state. Send suggestion saves a safe reviewed response; Approve & send records explicit authorization for a sensitive reply. Edit loads the original suggestion into the composer, Discard draft removes the association, and Decline leaves manual replies available. Replies are simulated and stored in the existing MongoDB database, then displayed in history across refresh/restart. No order action is performed.

`AUTO_SEND` means eligible, not already sent. The demo's Simulate automatic send control exercises the same authoritative reply route in automatic mode. It requires a successful live candidate, known intent, exact reviewed wording, complete evidence and confidence >= `ESCALA_CONFIDENCE_THRESHOLD` (default 0.90). Free-form/high-confidence alone does not pass grounding. `APPROVAL_REQUIRED` always blocks automatic mode; `REVIEW_REQUIRED` keeps low/unavailable-confidence suggestions visible. `MANUAL_ONLY` represents no usable suggestion. See [POLICY.md](docs/POLICY.md).

**Why drafting was unavailable:** the old service short-circuited risky messages before calling OpenAI and the local clone has no `OPENAI_API_KEY`. The shortcut is removed. Without that key, the UI names the missing configuration and shows clearly labeled reviewed template wording with null confidence. This is not model output. To enable live drafting, set `OPENAI_API_KEY`, `OPENAI_MODEL` and `OPENAI_REASONING_EFFORT` in ignored `.env.local`, and restart Next.js. MongoDB must be a replica set (Atlas or local replica set) for reply/audit transactions. No credentials were recovered from another project.

Production run after setting `.env.local`:

```powershell
npm run build
npm run start -- -H 127.0.0.1 -p 3100
```

Verified locally on 2026-09-28: all 60 tests passed with the integration flag, lint/typecheck/build and 17-message/7-document validation passed. The real HTTP/Mongo test covers fallback drafts, approval bypass rejection, editing/manual sends, idempotent retries, decline/stale protection, preserved priority, audit and app restart. A local protocol stub tests actual SDK parsing, high/low confidence, safe automatic simulation and rejection of a completed-refund claim; this is not live OpenAI validation. In the actual browser, all cases below were opened and exercised; edited/manual/approved replies survived reload and the edit audit showed original and final wording.

| Buyer case | Sentiment | Intent | Risk / local delivery state | Browser action |
| --- | --- | --- | --- | --- |
| Hi, does this come in black? | Neutral | Product information | Low / review required | Edit and send a question; no invented black stock |
| I ordered medium but got large. | Neutral | Wrong item | Low / review required | Edit/send, reload, inspect original/final audit |
| where is my fucking package | Negative | Order status | Low / review required | Send suggested order-number question |
| Cancel my order. | Neutral | Cancellation | High / approval required | Approve/send acknowledgement; no cancellation claim |
| I want a refund. | Neutral | Refund | High / approval required | Edit; send disabled until explicit approval; save |
| dit me may tra tien cho tao | Negative, Vietnamese rules | Refund | High / approval required, priority 85 | Approve/send Vietnamese draft and reload |
| Can you sort that thing out? | Neutral | Unknown | Low / review required | Retain draft, decline it and send manual clarification |
| cảm ơn shop nha hàng đẹp lắm | Positive, Vietnamese rules | Positive feedback | Manual reply without recommendation | Send Vietnamese thank-you and reload |

Local template confidence is null, not a fabricated low model score. The numerical 0.40 low-confidence and 0.96 high-confidence paths were exercised with the protocol stub in integration tests. Live generation quality and confidence calibration remain unverified without credentials and representative human-reviewed replies. The phrase-based risk/intent rules and templates are intentionally limited; auto-send uses conservative reviewed wording. The English checkpoint and ONNX hashes are unchanged; no sentiment training or priority-weight changes occurred in this task.
## Integrated sentiment and triage

`src/server/policy.mjs` owns inspectable routing, Vietnamese tone cues, intent detection, temporal urgency, and queue priority alongside Escala's existing recommendation policy. Accents are one language signal; Vietnamese phrases, unaccented vocabulary, teencode, and mixed text also route to Vietnamese rules. The original message is retained. Questions, requests, and factual issue reports default to neutral; explicit dissatisfaction or abuse is negative. Rule labels have no calibrated confidence. Short ambiguous messages, negation, sarcasm, and unfamiliar slang remain limitations; these rules are not general Vietnamese sentiment validation.

`src/server/sentiment.mjs` loads the local English model once per server process, using Transformers.js/ONNX on CPU with remote downloads disabled. Sentiment confidence is separate from the OpenAI candidate's recommendation confidence. Missing or malformed model assets produce an explicit unknown/unavailable result, not an invented neutral label. Hard financial or order-action rules retain authority regardless of either model's output; local replies are persisted as simulated delivery and no marketplace message is sent or order changed.

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

Escala does not integrate with Shopee, send external customer messages, mutate marketplace orders, or reuse DOCRELAY/SAND assets. Demo data is synthetic. Recommendation accuracy and seller trust remain unvalidated.
