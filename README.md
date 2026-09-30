# Escala

Escala is a seller-support MVP for marketplace operations. It turns buyer messages into evidence-backed recommendations and presents them in a Shopee Seller Centre-inspired workspace. The interface is an original Escala design and is not affiliated with Shopee.

## Current status

The MVP includes a responsive seller inbox, synthetic support scenarios and knowledge-base data, a MongoDB persistence layer, an OpenAI Responses integration, deterministic risk policy, and seller decision audit records. External message sending and order mutation remain disabled. The smaller deterministic engine prototype and its contract tests from the repository's earlier work are preserved separately at `src/determination-engine.js`.

## Live demo

[Open Escala on Vercel](https://escala-32ce3m3py-acne-a6cd.vercel.app) — this production deployment may require Vercel authentication or project access.

Development now uses this cloned Escala repository. The authorized Shop Signal migration integrates its local English checkpoint and Vietnamese triage into Escala's existing server, contracts, MongoDB thread records, and inbox components. There is one Next.js app and one database system (MongoDB). No old SQLite database or FastAPI service is used.

Autonomous inbox implementation verified on 2026-09-29 against the existing 60-test baseline; the expanded suite passed all 84 tests. See the current verification section below for the expanded checks. The API test verifies persisted seller replies, recommendations and audit records across an app restart and runs the cached-analysis refresh command. Atlas connectivity and live OpenAI generation were not verified in this clone. The current Vercel production deployment is linked below, but its access gate prevented public app-page verification. No credentials were copied from the old project.

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

The existing inbox uses a conversation list and a dominant active chat, with analysis closed by default. Filters are **Needs attention / Handled / All**. Each row shows the latest persisted message/time and one primary status: Needs reply, Needs approval, Handled or Waiting for customer. An optional urgency indicator reflects temporal urgency, not risk or queue priority. Priority scores, sentiment, model source/confidence, evidence and audit details remain behind **View analysis**. Queue ordering and original buyer analysis inputs are unchanged.

Message history scrolls separately from one concise reply/action area. Buyer bubbles are neutral and left-aligned; sent seller bubbles use a soft brand tint on the right. Prepared drafts remain available for review and inline editing; uncertain conversations offer a manual reply. Handled conversations show the sent reply and a quiet waiting state instead of an empty composer. Sensitive **Approve & send** opens a native confirmation dialog displaying the exact reply; **Confirm & send** uses the same backend approval contract. Editing, new buyer context and changed relevant conversation state invalidate that snapshot. Ctrl/Cmd+Enter uses the same flow; Enter makes a new line. **Demo mode** explains synthetic messages, simulated delivery, generation availability and no marketplace/order side effects in one disclosure.

The top-bar Color theme control offers System, Light and Dark. Preference persists in localStorage (`escala-theme`); System follows OS changes. An inline script in the existing root layout applies the resolved theme before body paint. Storage failures leave a working session theme. The existing CSS variables define both palettes; no theme dependency/provider or second design system was added.

| Token role | Light | Dark |
| --- | --- | --- |
| Background | #F4F3EF | #1A1B1D |
| Primary surface | #FDFCF9 | #222426 |
| Secondary surface | #F0EFEB | #2A2D2F |
| Raised surface | #EAE9E4 | #333739 |
| Border | #E6E4DE | #363A3B |
| Primary text | #282B2C | #EDEEEB |
| Secondary text | #72746F | #A0A5A1 |
| Brand | #F05A28 | #FF6B3D |
| Brand hover | #D94E21 | #FF7C54 |
| Soft brand tint | #FFF1EB | Low-opacity brand mix |
| Information | #2563EB | #60A5FA |
| Review/warning | #D97706 | #FBBF24 |
| Risk/negative | #DC2626 | #F87171 |
| Success/positive | #16A34A | #4ADE80 |

Semantic colors appear in small labeled indicators, icons and subtle tints. Large surfaces stay neutral. Contrast variants handle small text; primary orange buttons use readable foregrounds. Existing queue/context drawers support narrower screens without duplicating the inbox. The English checkpoint, Vietnamese rules and priority weights are unchanged. Reply policy now additionally holds generated commitments, hostility and uncertain/conflicting analysis.

Browser verification for this redesign covered light/dark preference and reload persistence, System resolution against the current OS preference, conversation switching, urgent and negative cases, order/evidence/context tabs, edited and manual multiline sends, sensitive-action approval, original/final audit text, long-message wrapping and independently scrolling copilot details. CSS viewports 1440×900, 900×650, and 390×600 were exercised. Local production delivery remained simulated. Screenshots are saved in ignored `.local/verification/messaging-{light,dark,mobile}.png`.

Earlier messaging-only verification used reviewed templates with unavailable confidence because no OpenAI key was configured. The current autonomy preview additionally uses clearly labeled local SDK fixture candidates. Live AI and actual marketplace sends were not tested. Physical-device keyboard behavior, comprehensive assistive-technology testing and confidence calibration still need evaluation. Very short windows prioritize the composer and can require scrolling within the copilot. Theme bootstrap reduces wrong-theme flash; a content-security policy that blocks inline scripts would need a nonce or hash. The in-app browser's screenshot capture showed scaling/clipping artifacts; DOM geometry and interactive checks verified layout/controls, but those images are imperfect visual evidence.

### Simplified seller flow verification — 2026-09-29

The UI-only simplification changed eight existing component/style files and this documentation; no new files, dependencies, APIs, domain contracts or backend policy changes were needed. Full suite with `ESCALA_RUN_INTEGRATION=1`: **84 passed, zero failures or skips**. Full lint, TypeScript checks and production build passed.

Actual production-browser checks covered Needs attention / Handled / All, prepared reply editing, cancellation confirmation and Cancel, Ctrl+Enter using the same dialog, an incoming buyer message closing an open approval and retaining/locking the draft, explicit re-review and simulated sending, uncertain/manual reply, automatic reply attribution, View reply without an empty composer, analysis/evidence/activity, compact Demo disclosure, factual summary and acknowledged quiet interval. Audit/HTTP reads verified the approved text and revision, simulated receipts, and retained messages across a Next restart. ON sent a safe Vietnamese acknowledgement while cancellation stayed held; PAUSED left a new buyer message unclassified with no draft; DRAFT_ONLY then prepared it without sending. Final mode is DRAFT_ONLY.

Editing a factual wrong-item draft into “I will refund your payment.” was rejected by the server before any delivery record or reply was created. The UI then offered fresh sensitive confirmation showing that exact text; Cancel left it unsent. New sensitive wording in a previously low-risk draft is discovered on the first server send check and then presents confirmation, rather than relying on a duplicated browser policy engine.

Responsive checks used observed CSS viewports 1280×800, 900×650 and 390×600, accounting for the browser's existing zoom without changing that preference. Document width equaled viewport width; the desktop inspector left a 668-pixel chat, smaller layouts used a modal analysis drawer, and mobile confirmation controls stayed inside the viewport. Both themes and theme reload persistence were checked; temporary viewport overrides were reset. Captures under ignored `.local/verification/simple-*.png` showed the same in-app capture scaling/clipping artifacts noted above, so they are imperfect visual sign-off evidence. First-time seller testing is still needed to validate the 2–3-second comprehension target; physical keyboard and full assistive-technology testing remain outstanding.

## Autonomous seller inbox

Buyer events enter the existing thread service, persist original text and queue a durable MongoDB job. The background worker then runs local sentiment/intent/urgency/priority analysis and drafting when the backend mode permits it. The server worker prepares a candidate through the existing OpenAI Responses adapter. Deterministic policy inspects buyer context **and generated text**. UI reads never trigger generation or automatic delivery.

| Policy decision | Behavior |
| --- | --- |
| AUTO_SEND | Eligible only: known intent, valid candidate confidence ≥0.90, exact reviewed wording, matching current evidence and no consequential commitment. Sends through simulated transport only while backend mode is ON. |
| APPROVAL_REQUIRED | Money/order/security/dispute/returns/guarantees and generated commitments stay held. Approval binds exact trimmed final text, conversation revision and pending proposal. |
| REVIEW_REQUIRED | Uncertain intent/classifier, low confidence, missing/stale facts, hostile wording, conflicting model intent or unreviewed wording. Draft is prepared for seller review. |
| MANUAL_ONLY | No usable proposal or explicit seller manual disposition. Manual replies still pass deterministic risk checks. |

Stock/tracking answers require trusted repository snapshots with evidence ID, observation time, expiry and bounded values. Requests cannot inject verified facts. Stock replies report availability without reserving stock; tracking replies report status without a delivery guarantee. Factual problem reports can remain neutral; urgency never grants permission. Classifier unavailable/unknown or English score below 0.60 blocks automation. That score is an additional conservative gate, not calibrated real-customer accuracy.

**Backend controls:** ON processes and may send eligible replies; DRAFT_ONLY prepares without sending; PAUSED leaves incoming jobs queued without automatic processing/sending. New workspaces default to DRAFT_ONLY. Environment mode only initializes a new workspace; the persisted setting and version govern existing workspaces. The header refreshes settings independently of the stable opening brief. Explicit seller replies remain possible when paused.

**Delivery and safety:** one existing replies endpoint serves manual, suggested, edited, automatic and retry operations. MongoDB persists QUEUED → SENDING → SENT/FAILED, provider receipt and request identity. A failed send records no seller message; retry reuses the attempt ID. Transactions serialize context, recommendation consumption and the mode fence. Duplicate/concurrent inbound events and worker claims are idempotent. A new buyer message supersedes old jobs/drafts. Edited approvals, changed evidence, consumed proposals and in-flight mode changes fail closed. Seller resolution/escalation is explicit and never changes order/payment state. A later human correction can reference the automatic message via correctedMessageId in the same reply contract.

**Opening experience:** Needs attention / Handled / All use persisted conversation states. Handled includes automatically handled, waiting-for-customer and explicitly resolved work. Review drafts preload once, preserving typed edits through polling and thread switches. A new buyer revision or an automatically consumed suggestion requires reviewing current context before retained text can be sent. Analysis is closed by default and opens as a panel on desktop or a drawer on smaller screens; light/dark themes use the existing CSS tokens. Automatic replies retain timeline attribution. The opening brief uses short factual sentences and **View summary** for detailed events, timeframe and current backlog.

**Brief:** GET /api/autonomy aggregates structured audit events between persisted lastSeenAt and captured asOf. First visit uses the server-day boundary, returned as an exact timestamp. Incoming/automatic/resolved/failed/escalated counts are activity in that interval; review/approval counts are **current backlog**. Acknowledging only the displayed asOf leaves later events for the next visit. GET is read-only. No LLM invents digest facts. orderUpdates is empty because no authoritative order-update connector exists. A quiet period says no new activity.

### Exact commands

Configure ignored .env.local from .env.example (MongoDB replica set required; OpenAI optional). No key means clearly labeled reviewed templates with null confidence; they never auto-send.

```powershell
npm install
npm run build
npm run start -- -H 127.0.0.1 -p 3100
```

A long-running local Next server starts the worker every three seconds through src/instrumentation.ts. For a dedicated worker using the **same** jobs and service, set ESCALA_AUTONOMY_WORKER=0 on Next and run:

```powershell
npm run worker
# One bounded pass, useful for a scheduler or troubleshooting:
npm run worker:once
# A larger bounded pass:
node --env-file=.env.local --import tsx scripts/process-inbox.mts --once --limit 100
```

An example synthetic inbound event (no trusted stock/payment fields accepted):

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3100/api/threads/example-buyer/messages -ContentType application/json -Body '{"eventId":"example-event-0001","text":"Do you have this in size M?","buyerName":"Example buyer"}'
```

Use the header to change mode, or POST /api/autonomy with mode and the current expectedVersion from GET /api/autonomy. Retry POST /api/threads/:id/replies with retryAttemptId from the thread's delivery records. PATCH the existing thread route with state and contextRevision for explicit resolution/escalation/manual handling.

### Test-only local generation

Integration tests and browser auto-send checks use scripts/responses-fixture.mjs to exercise the actual Responses SDK with deterministic local candidates. It performs **no AI inference or external calls**. These numerical fixture confidences are not real model evaluation. For an explicitly labeled local preview, start:

```powershell
node scripts/responses-fixture.mjs 3130
```

In another terminal, set OPENAI_BASE_URL=http://127.0.0.1:3130/v1, OPENAI_API_KEY=test-only-not-a-real-key and ESCALA_GENERATION_PROVIDER=test_stub before starting Next. Test candidates are labeled “Local test candidate · no live AI.” Remove these overrides for actual OpenAI drafting. Never use this stub as a production generator. ESCALA_SIMULATED_TRANSPORT_FAIL=1 is a local fault-injection switch for recorded FAILED/retry behavior, not a real transport.

### Verification and remaining limits

Baseline: **60 passed** before changes. Expanded tests cover all 14 requested cases plus classifier failure/low score, expired/changed evidence, explicit seller state, generator failure and pause/new-buyer races during generation. The HTTP suite runs a real isolated MongoDB replica set, production Next server, actual SDK adapter and CLI worker. It checks persistence across restart and counts actual messages/audits rather than frontend labels. Use the integration flag from Verification above; no Atlas or live OpenAI calls occur.

Final gates: **84 tests passed, zero failures or skips** on 2026-09-29 with `ESCALA_RUN_INTEGRATION=1`; lint, TypeScript checks, production build and validation of 17 demo messages / 7 knowledge documents passed.

Browser checks on the production app with persisted local MongoDB and the labeled test stub verified prepared drafts, edit/approval invalidation, stock/tracking automatic simulated replies, held sensitive requests, persisted activity across restart, and the opening brief. PAUSED left a new Vietnamese buyer message unclassified with no draft; DRAFT_ONLY then prepared its reply without sending. Light/dark, context collapse/reopen and the three-column desktop layout were checked again on 2026-09-29 at 1280×720; document width equaled viewport width. Clean final captures are saved in ignored `.local/verification/autonomy-{light,dark}.png`; earlier capture artifacts described above do not affect these final images. The preview remains in DRAFT_ONLY.

No English retraining, Vietnamese model replacement, real marketplace send or order mutation occurs. Authentication/multi-tenancy, real provider receipts/reconciliation, representative customer evaluation, calibrated reply confidence and live OpenAI/Atlas/Vercel deployment remain unverified. A serverless process may stop its interval worker: deploy the durable CLI worker/scheduled bounded pass before relying on unattended serverless processing. Real transport delivery cannot be made exactly-once by a Mongo transaction alone; it requires provider idempotency and reconciliation.

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
