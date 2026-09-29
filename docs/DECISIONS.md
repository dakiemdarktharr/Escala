# Escala decision log

## 2026-09-24 — Start with Phase 0 and a local vertical slice

**Decision:** Create product framing, deterministic policy rules, a small versioned JSON knowledge base, synthetic messages, and validation before implementing the dashboard.

**Why:** The engineering path is feasible, but seller trust, the usefulness of urgency ranking, and live-channel assumptions are unvalidated. A narrow local slice is the smallest way to test the product behavior.

**Consequences:** The first demo will not send real messages or mutate orders. It can still demonstrate evidence, risk explanations, action recommendations, seller control, and audit intent.

## 2026-09-24 — Keep action permission deterministic

**Decision:** LLM output may interpret and draft, but hard-risk rules and grounding checks decide whether automatic action is allowed.

**Why:** Refunds, payment, cancellation, complaints, commitments, and unsupported answers create disproportionate trust and business risk.

## 2026-09-24 — Use synthetic JSON fixtures

**Decision:** Store small local JSON fixtures instead of building ingestion or vector infrastructure.

**Why:** The hackathon needs a reproducible demo and inspectable evidence references. This is faster and easier to explain than production-grade retrieval.

## Open decisions

- final web framework and component library;
- exact LLM model and structured-output adapter;
- whether seller validation will use 10–20 manually reviewed messages before the demo;
- persistence approach after the core vertical slice works.

## 2026-09-28 — Use the cloned Escala repository

**Source of truth:** The owner directed cloning `https://github.com/dakiemdarktharr/Escala.git`; inspected base commit `be09cc7`. The parent Shop Signal directory is read-only reference material for this task. All implementation changes are under the cloned `Escala/`. README, AGENTS, agent workflow, master handoff, package, source, scripts, both test directories, data, and API/model/persistence paths were inspected. Some handoff/decision text still describes Phase 0, while actual code is a Next.js/MongoDB/OpenAI MVP. Actual interfaces and current architecture were used. The explicit owner migration request authorizes adapting the Shop Signal artifacts despite older general non-reuse setup language.

### Migration map

| Reference responsibility | Escala file(s) | Integration decision |
| --- | --- | --- |
| `backend/language.py`, `vietnamese.py`, `analysis.py`, `priority.py` | Existing `src/server/policy.mjs`, `policy.d.mts`, `inbox-service.ts` | Adapted routing, factual-neutral tone, token-bounded intents, temporal urgency, demand/abuse reasons, and priority; kept Escala policy authority. |
| `backend/ml.py`, `model_inference.py`, deployed checkpoint | New `src/server/sentiment.mjs` / declaration; ignored `data/models/english/` | Existing server had no local-classifier responsibility. Node ONNX is used instead of a Python API so Next.js remains the only runtime application. Original source weights/hash preserved. |
| `backend/db.py`, `service.py`, reanalysis scripts | Existing `src/server/repository.ts`, `mongodb.ts`, `inbox-service.ts`; new `scripts/refresh-analysis.mts` | Cache signals in existing MongoDB threads; explicit refresh keeps original messages and seller state. No schema/database copy. |
| Old frontend displays | Existing queue, presentation, recommendation, thread, sample components and global styles | Added distinct priority/urgency/sentiment and seller reasons within Escala's UI; no old components/layout copied. |
| Data audit, preparation, training, evaluation | New `scripts/sentiment.py`, `scripts/requirements-sentiment.txt`; `data/sentiment/raw/` and `results/` | Consolidated tooling replaces multiple standalone scripts and the workflow package. Preserved raw labels, reproducible splits, provenance, review candidates, and metrics. |
| Old regression cases | New `tests/triage.test.mjs`, `tests/inbox-integration.test.mjs` | Adapted to Node tests; HTTP integration exercises existing routes against real temporary MongoDB with transactions/restart. |

### Files modified

- Server/domain: `src/server/policy.mjs`, `policy.d.mts`, `inbox-service.ts`, `repository.ts`, `mongodb.ts`, `src/domain/contracts.ts`.
- UI: `src/components/inbox/conversation-queue.tsx`, `presentation.tsx`, `recommendation-panel.tsx`, `thread-workspace.tsx`, `sample-data.ts`, `src/styles/globals.css`.
- Configuration/data: `.env.example`, `.gitignore`, `next.config.ts`, `package.json`, `package-lock.json`, `data/demo/messages.json`.
- Documentation: `README.md`, `docs/ARCHITECTURE.md`, `POLICY.md`, `DECISIONS.md`, `HACKATHON-COMPLIANCE.md`.

### New files and why

- `src/server/sentiment.mjs` and `sentiment.d.mts`: local-model adapter missing from Escala, plus TypeScript declaration using the existing shared sentiment type.
- `scripts/sentiment.py`: one offline tool for prepare/train/evaluate/export; no suitable existing ML script existed. Training is not run as an import side effect or through a notebook.
- `scripts/requirements-sentiment.txt`: isolated optional training/export dependencies; no FastAPI or second app requirements.
- `scripts/refresh-analysis.mts`: explicit MongoDB cached-analysis migration, outside inbox reads; no duplicate endpoint.
- `tests/triage.test.mjs`: language/tone/intent/time/priority regressions and real Node model parity.
- `tests/inbox-integration.test.mjs`: real MongoDB/HTTP persistence, restart, cache, audit and risky-action rejection checks missing from the prior suite.
- `data/sentiment/raw/{653_dev.csv,shop_sentiment_strict_500.csv}`: unchanged provenance inputs needed for audit/retraining/leakage checks.
- `data/sentiment/results/{audit.json,duplicate_pairs.csv,human_review.csv,split_manifest.csv,test_comparison.json,test_predictions.csv,export_parity.json}`: reproducibility/evaluation evidence, not a parallel application.
- Ignored local assets `data/models/english/`: one unchanged source checkpoint plus the Node runtime ONNX format/tokenizer/export metadata; the two formats serve reproducibility and runtime needs.

### Deliberately not migrated

- Old `frontend/`, FastAPI `backend/` application/router/server, standalone README and app scaffolding: Escala already provides these responsibilities.
- `shop.db`, all SQLite backups, and any renamed/second shop database: existing Escala MongoDB collections remain the only persistence architecture. No customer/history database was imported.
- `urgency_baseline/` and `message_analysis.py`: unvalidated downloaded-data urgency experiment; Escala keeps deterministic urgency and action safety.
- `sentiment_model/`, `checkpoints/baseline_legacy_653/`, and duplicate candidate copies: legacy/duplicate artifacts remain in reference material. Only the selected deployed source is migrated. A future baseline can be supplied explicitly to the offline trainer/evaluator; the runtime never reads the parent directory.
- `data_prep.py`, individual preparation/evaluation/training/CLI/reanalysis wrappers, `sentiment_workflow/`: useful responsibilities consolidated/adapted, original file layout abandoned.
- Python caches, demo SQLite state, old tests/framework configuration, credentials, and earlier generated app assets: not copied.

### Duplicated responsibilities avoided or corrected

Escala's evidence lookup, OpenAI candidate/draft adapter, policy confidence gates, audit events, MongoDB repository, shared contracts, and existing UI were retained. No second API, frontend, database system, workflow package, or duplicate interfaces were introduced. Runtime fixture-oracle shortcuts were removed from intent/urgency/evidence lookup. Risk no longer inherits urgency. The UI now saves unchanged seller-review drafts as reviewed edits instead of automatic approvals, and the server blocks reply decisions on escalations. Historical determination-engine prototype/tests were preserved as Escala-owned reference behavior, not replaced with a third engine.

### Verification

Dependency install succeeded; introduced dependency advisories were resolved by the patched Transformers.js release (npm installation audit: zero vulnerabilities). Full suite with `ESCALA_RUN_INTEGRATION=1`: **51 passed, zero skipped**. Lint, typecheck, 11-message/7-document demo validation, and production build passed. The production HTTP test confirmed MongoDB-backed cached analyses, recommendation/audit transactions, unsafe reply rejection, inbox priority order, exact messages, cached-analysis refresh, and persistence across an app restart. The final test command ran outside the sandbox because tsx's Windows user-information lookup was blocked inside it. Atlas and live OpenAI generation were not tested; the local test uses no credentials and no external sends.

Data preparation reproduced the same 349/75/75 split and one exclusion. Re-evaluation reproduced baseline/candidate macro F1 0.8286/0.9681. Source model hash unchanged. fp32 ONNX export matched all 75 labels, max logit difference 0.0000203848; actual Node tokenizer/inference matched all 75 labels with confidence difference below 0.001. This is numerical conversion verification, not new training or proof of real-customer accuracy. A production server and browser inbox were exercised locally with synthetic MongoDB seed data.

## 2026-09-28 — Seller reply workflow

The owner requested actionable seller communication rather than generic escalation. Existing runtime policy, recommendation service, Mongo repository, shared contracts, inbox components and audit log were inspected before implementation; the implementation map was given before edits. No work was added to the parent standalone project.

### Existing files modified

- `src/server/policy.mjs` / declaration: one deterministic reply-delivery gate plus reviewed template wording and prohibited generated-action checks; old action evaluator projects that gate rather than maintaining a second policy. Narrow intent fixes for wrong size, profane shipment status and color questions. Removed order-status/generic-complaint-as-order-side-effect mistakes, added replacement/reshipment gates. Priority weights, routing and Vietnamese sentiment rules unchanged.
- `src/server/inbox-service.ts`: risky messages now draft; honest missing-key/failed-generation fallback; shared reply send implementation; seller approval, threshold/grounding, stale/declined/duplicate checks; message/audit transaction and original/final provenance.
- `src/server/mongodb.ts`, `repository.ts`: messages collection in the existing database, idempotent buyer materialization, per-thread seller-message sequence and unique request IDs. Buyer text/analysis inputs and old audit data preserved.
- `src/domain/contracts.ts`: single shared delivery-state/reply/audit contract extended; no copied types.
- Existing decision API route: supports decline/handoff, directs legacy delivery-like decisions to the reply workflow.
- Existing frontend: `api.ts`, `inbox-workspace.tsx`, `thread-workspace.tsx`, `recommendation-panel.tsx`, `context-panel.tsx`, `sample-data.ts`, `globals.css`: one client reply call, unconditional composer, edit/discard/approve/send, persisted seller history and provenance display. Sample preview remains explicitly nonpersistent.
- `data/demo/messages.json`: six additional synthetic reply cases, 17 total; expected annotations remain test data, not runtime answers.
- Existing `tests/inbox-integration.test.mjs`, `policy.test.mjs`, `triage.test.mjs`: updated delivery semantics, SDK protocol stub, actual Mongo/HTTP restart/approval/idempotency/edit/manual checks, tone-independent risk and preserved priority regressions.
- `README.md`, `docs/POLICY.md`, `ARCHITECTURE.md`, `SETUP.md`, `DEMO-SCRIPT.md`, this decision log: workflow/configuration/verification and explicit limits.

### New files

- `src/app/api/threads/[threadId]/replies/route.ts`: no existing endpoint persisted a seller message. This is the single message-delivery route for all reply modes; it calls the existing service rather than a second backend.
- `tests/reply-policy.test.mjs`: focused regression matrix for independent risk/confidence/delivery, requested messages and unsafe generated claims; existing triage tests continue to protect priority/sentiment.

No new frontend, backend application, database system, wrapper modules or model artifacts. Old project files were not imported in this task. Obsolete escalation-only reply semantics and duplicate draft-edit panel ownership were replaced in their existing owners; the original historical determination-engine prototype remains outside runtime.

### Verification and limits

Full suite with integration: **60 passed, zero skipped**; lint/typecheck/build and 17-message/7-document validation passed. HTTP tests use real isolated temporary MongoDB, restart Next.js, preserve messages/events, reject approval and automatic-send bypass, and confirm unchanged priorities. SDK candidate handling uses an explicitly test-only local Responses protocol stub (0.40/0.96 confidence); no live generation is claimed.

Actual browser checks opened all requested messages, sent safe suggestions, approved sensitive replies, edited text, declined/overrode a suggestion, sent a manual Vietnamese reply without a recommendation, and confirmed reload persistence and original/final audit display. The existing demo MongoDB was retained during server restart, preserving earlier seller events. Local template confidence is null and the exact missing key is shown.

English source SHA256 remains `fe9f3a0ce17660e048ada03c4db1f26063e9ff6ff8f6657d16df5230a8993dba`; ONNX SHA256 remains `a532971e33c196e4298c0a262553071f1e96ecd879f8c97c18e9b78fe4460aa1`. No sentiment training/weight changes. No Atlas, production connector, public multi-user deployment or live OpenAI evaluation claimed. Risk/intent/claim checks are limited phrases and templates, model confidence is uncalibrated, and arbitrary free-form replies require seller review. Seller approval sends only simulated communication; it never executes refunds/orders.

## 2026-09-28 — Messaging-first inbox and warm graphite themes

Refactored only the cloned Escala app. The existing responsibility map was inspected and given before implementation: queue → `conversation-queue.tsx`; shell/theme → `inbox-workspace.tsx`, root layout and shared CSS; header/history/composer → `thread-workspace.tsx`; copilot → `recommendation-panel.tsx`; analysis/evidence/activity → `context-panel.tsx`. No parallel app/component tree, new dependency, copied model, database or API.

### Existing files modified

- `src/app/layout.tsx`: pre-paint theme bootstrap.
- `src/components/inbox/inbox-workspace.tsx`: compact Inbox shell, accessible System/Light/Dark preference, OS/storage listeners; existing queue/context drawers.
- `conversation-queue.tsx`: avatars, latest preview/time, unread state and at most two chips.
- `thread-workspace.tsx`: compact summary/View analysis, left/right message bubbles, separate scrolling history and copilot above persistent multiline composer; Enter newline and Ctrl/Cmd+Enter gated send.
- `recommendation-panel.tsx`: compact draft/source/review/approval card, retained send/edit/decline/regenerate/automatic eligibility controls with details disclosure.
- `context-panel.tsx`, `presentation.tsx`: Analysis/Evidence/Activity tabs, routing/source/confidence/priority explanations plus policy and provenance retained.
- `sample-data.ts`: latest-message preview/time in the existing in-memory sample client.
- `src/components/ui/icon.tsx`: theme/send icons in the existing icon owner.
- `src/styles/globals.css`: one light/dark token stylesheet, neutral surfaces, semantic text/tints, anchored shell, independent scroll areas and responsive drawers. Contained visually hidden unread labels to prevent focus-induced ancestor scrolling. Contrast variants cover small text on secondary surfaces and orange hover buttons.
- `src/server/inbox-service.ts`: last sequenced message projection for visible preview/time; original buyer fields and priority/tie order preserved.
- `tests/inbox-integration.test.mjs`: latest preview/time and preserved buyer-input regression assertions.
- `README.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN_REFERENCES_SHOPEE.md`, this log: ownership, tokens, interaction behavior and verification limits.

### Verification and limits

No new tracked files. Lint/typecheck/production build and 17-message/7-document validation passed. Full regression suite: **60 passed, zero failed or skipped**. Existing real Mongo/HTTP tests protect persistence across restart, approval/confidence/grounding gates, original/final edit audit, retry behavior, model labels and unchanged priority.

Actual browser checks used local production Next.js and synthetic MongoDB: light/dark persisted across reload, System matched the current OS preference, queue switching, urgent buyer D, negative shipment and hostile Vietnamese refund, positive Vietnamese feedback, factual neutral wrong size, order 8831/evidence, original/final edited-suggestion audit, multiline manual send, direct reviewed-template send, approved sensitive acknowledgement, disabled unapproved Ctrl+Enter and decline. Long repeated prose and an unbroken reference wrapped without horizontal overflow; history and expanded copilot details scrolled while the composer stayed visible. Context drawer/Escape and mobile queue selection worked at 900×650 and 390×600; Send remained within 390×400. Temporary viewport overrides were reset. Screenshot evidence is ignored local verification output, not another UI implementation.

The earlier ephemeral preview MongoDB had expired when work resumed; the preview was reseeded using existing repository code into a local replica set with persistent files under ignored `.local/demo-mongo`. Browser replies persisted across Next.js restarts/reloads. No remote database or external message delivery was used. The in-app screenshot capture produced scaling/clipping artifacts, including text cutouts and unused margins. Read-only DOM geometry confirmed anchored headers, controls within the viewport and no message horizontal overflow; screenshot evidence is imperfect and needs a clean capture on the target device for final visual signoff.

English source and ONNX hashes remain unchanged (listed above); no retraining, policy-engine or priority-weight edits. Live OpenAI is unavailable locally; reviewed templates show null confidence. Numerical low/high confidence paths use the existing explicitly test-only Responses protocol stub. Physical mobile keyboards, full assistive-technology coverage, real customer evaluation and live connectors remain unverified. Very short windows can require scrolling within copilot details; the manual composer retains precedence.


## 2026-09-28 — autonomous seller inbox in the existing app

### Reused owners

- src/server/inbox-service.ts: inbound raw-message persistence/revision invalidation, worker analysis, existing Responses generation, current-context final policy, exact-text approval, transport/outbox persistence, state controls, settings and structured brief.
- src/server/policy.mjs and declaration: generated commitments, hostile/conflicting signals and fresh bounded repository stock/tracking wording; sentiment rules and priority weights retained.
- src/server/mongodb.ts and repository.ts: same MongoDB system; jobs/deliveries/settings collection types/indexes and missing-metadata backfill. Existing messages/audits are retained. Background processing does not overwrite raw text. Explicit analysis refresh now avoids overwriting a changed buyer revision.
- src/domain/contracts.ts: shared typed modes, conversation/delivery states, inbound events, receipts, context/approval and brief; no duplicate interfaces.
- Existing thread/replies routes: PATCH seller state and retry variants; existing generation/decision routes remain.
- Existing inbox API client, sample client, queue/workspace/thread/recommendation/context/presentation components and globals.css: attention buckets, prepared drafts, exact approval, consumed/stale draft review, GET-only polling, stable brief, mode control, collapse context and warm light/graphite dark tokens.
- tests/inbox-integration.test.mjs and reply-policy.test.mjs: extend the same real Mongo/Next/SDK regression harness.

### New files and necessity

| File | Missing responsibility |
| --- | --- |
| src/server/autonomy.ts | Claim/recover durable Mongo jobs independently of UI reads and call existing service owners |
| src/server/transport.ts | Existing direct persistence had no simulated transport abstraction/receipt |
| src/instrumentation.ts | Start that worker on a Node Next server lifecycle |
| scripts/process-inbox.mts | Run the same worker durably outside a request or once for a scheduler |
| src/app/api/threads/[threadId]/messages/route.ts | Existing app had no inbound buyer-event ingestion endpoint |
| src/app/api/autonomy/route.ts | Existing app had no persistent mode/last-seen/brief API |
| scripts/responses-fixture.mjs | Extract and reuse the test's local SDK protocol fixture for regression and honest browser demonstrations; no production generator |

No second frontend/API stack, database system, sentiment model, package dependency, copied standalone project, or wrapper around a duplicated generator was introduced. The previous click-to-suggest / client simulate-auto-send path was removed from normal inbox flow; optional regeneration remains an explicit seller action. Prior historical migration exclusions still apply.

### Verification

Original baseline: 60 passed. Final expanded suite on 2026-09-29: **84 passed, zero failures or skips**. It includes all 14 requested autonomy cases plus classifier failures, stale/expired evidence, seller dispositions, generation failure and pause/new-buyer races. Real MongoDB replica set, Next production HTTP, actual Responses SDK and reusable CLI worker are exercised. Lint, type checks, production build and demo validation passed. Browser checks verified persisted automatic tracking, prepared/held drafts, approval invalidation, paused inference, Draft only, brief facts and context collapse. Clean light/dark captures at 1280×720 confirmed no horizontal overflow; final preview mode is DRAFT_ONLY. The generator is a clearly labeled local protocol fixture, not live AI. No external delivery or order state mutation. Exact commands and remaining limits are recorded in README.

Model SHA256 values are unchanged: source fe9f3a0ce17660e048ada03c4db1f26063e9ff6ff8f6657d16df5230a8993dba; ONNX a532971e33c196e4298c0a262553071f1e96ecd879f8c97c18e9b78fe4460aa1. No training or Vietnamese model replacement.

## 2026-09-29 — simplify the seller-facing inbox

### Existing files modified

| File | Change |
| --- | --- |
| `src/components/inbox/conversation-queue.tsx` | Inbox, Needs attention / Handled / All; one primary status and optional temporal urgency |
| `src/components/inbox/presentation.tsx` | Friendly status/request wording; Handled includes replied/waiting/resolved work |
| `src/components/inbox/inbox-workspace.tsx` | Compact Demo disclosure and brief narrative; detailed summary remains optional; persisted mode/acknowledgement retained |
| `src/components/inbox/thread-workspace.tsx` | Simple header, one reply/action area, inline editing, closed analysis, exact-context confirmation instead of checkbox, handled/manual states |
| `src/components/inbox/recommendation-panel.tsx` | Short understanding/action heading; redundant metrics/options removed from primary flow |
| `src/components/inbox/context-panel.tsx` | Technical state, original proposal, evidence, source, policy and audit preserved in analysis |
| `src/components/ui/drawer.tsx` | Centered native-dialog variant reuses existing focus/Escape/inert behavior for confirmation |
| `src/styles/globals.css` | Existing theme tokens; simpler spacing, disclosure, confirmation and responsive layout |
| `README.md`, `docs/ARCHITECTURE.md`, `docs/POLICY.md`, `docs/DECISIONS.md` | Current presentation, approval semantics, file map and exact verification |

No new files or packages. No backend, API, persistence, shared-contract, trained checkpoint, Vietnamese rule, policy or transport changes. Friendly labels do not grant permissions. Existing exact-text/revision send checks still reject unsafe/stale approval. The UI additionally fingerprints the displayed recommendation, relevant state and evidence; it closes confirmation when polling reports changes. Sensitive confirmation still uses the existing reply endpoint and approval fields. Ctrl+Enter follows that same flow. Editing preserves text; new context requires explicit re-review before retained text can be sent.

Full suite: **84 passed, zero failures or skips**; lint/typecheck/production build passed. Actual browser verified all requested filters and approval/edit/stale/manual/handled/analysis/brief/theme/mode flows. An explicitly approved edited reply was persisted with exact text/revision, simulated delivery and audit across restart. Safe Vietnamese acknowledgement auto-sent in ON while cancellation stayed held. PAUSED left ingress unprocessed; DRAFT_ONLY subsequently prepared without sending. CSS 1280×800, 900×650, 390×600 had no document horizontal overflow; mobile confirmation buttons fit. Viewport reset; final mode DRAFT_ONLY and original dark preference restored. Local test fixture generation is not live AI. Saved screenshots have in-app capture artifacts; clean target-device visual sign-off and first-time comprehension testing remain outstanding.
