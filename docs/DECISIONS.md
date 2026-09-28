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
