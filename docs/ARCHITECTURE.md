# Escala architecture

## System flow

```text
Seeded/imported message
  → normalize thread and redact sensitive content
  → structured intent extraction
  → retrieve versioned knowledge with evidence IDs
  → generate candidate answer or clarification
  → check grounding and confidence
  → deterministic risk and urgency engines
  → deterministic policy action
  → seller-facing recommendation
  → audit event
```

The LLM may interpret language and draft text. It must not bypass the deterministic policy engine or execute an external side effect.

## Module responsibilities

| Module | Responsibility | Boundary |
| --- | --- | --- |
| Message adapter | Normalize local fixtures or future connector payloads | No live connector in MVP |
| Redaction/normalization | Normalize thread fields and remove unnecessary sensitive data | Does not decide action |
| LLM adapter | Structured intent, entities, sentiment hints, and candidate draft | Mock fallback required; output is untrusted |
| RAG adapter | Retrieve versioned documents and return evidence IDs/snippets | Empty retrieval is a safe state |
| Grounding check | Verify draft claims are supported by retrieved evidence | Failed check cannot auto-send |
| Risk engine | Detect hard-risk categories and conflicts | Deterministic and independently testable |
| Urgency engine | Rank visible factors such as deadline, payment, waiting time, and complaint language | Prototype ranking, not validated metric |
| Policy & Action Engine | Apply precedence rules and choose one allowed action | Final authority for action permission |
| UI | Show queue, reasons, evidence, draft, controls, and audit | No policy decisions in components |
| Audit log | Record recommendation, evidence, policy reasons, and seller decision | Every recommendation gets an event |

## Core records

The 2026-09-28 migration integrates local English sentiment and Vietnamese rules into the existing Next.js server. `src/server/sentiment.mjs` is the only new runtime adapter; it loads the authorized checkpoint's ONNX export locally. `policy.mjs` supplies language routing, rule sentiment, intent, temporal urgency, and priority. `repository.ts` persists these signals on existing MongoDB threads; `inbox-service.ts` returns the shared contract and ranks cached signals without re-running models. No parallel API, frontend, types, or SQLite store was added. See the migration map in [DECISIONS.md](DECISIONS.md).

Recommendation risk is derived from independent business-risk signals, not the thread's urgency. Sentiment confidence and recommendation confidence are different fields. Priority reasons combine action need, intent, time pressure, negative tone, hostile/direct demand flags, and waiting time; none grants action permission. Fixture expected labels/evidence remain test oracles and are not runtime classifications or retrieval output. Existing demonstration scenario flags still explicitly simulate ambiguity/model failure; this is not a general extraction benchmark.

Each recommendation should retain:

- message and thread IDs;
- normalized intent and extracted risk signals;
- retrieved evidence IDs and knowledge-base versions;
- grounding/confidence result and any model fallback reason;
- urgency level plus human-readable factors;
- exactly one recommended action;
- seller approval/edit/escalation decision;
- timestamps and policy version.

## Data flow and side-effect boundary

MongoDB stores seeded synthetic threads, buyer/seller messages, knowledge evidence, recommendations, and seller decisions. Use a repository boundary so fixtures remain available for development and safe fallback. `ESCALA_ENABLE_EXTERNAL_SEND=false` is mandatory; the MVP must not mutate marketplace orders or send external buyer messages. Local seller replies are persisted as explicitly simulated delivery. OpenAI handles structured language interpretation and draft suggestions only; deterministic policy retains action authority.

## Failure behavior

If retrieval is empty, evidence conflicts, confidence is low, the model fails, or grounding cannot be established, Escala must not invent an answer. It should show the limitation and route the message to clarification, seller draft, or escalation according to the deterministic policy.

## Deferred infrastructure

Authentication, multi-tenancy, live marketplace OAuth, vector store and billing remain deferred. The authorized autonomous inbox adds MongoDB jobs and a local/dedicated worker inside this application. Vercel deployment still requires separate validation, including a reliable worker runtime.

## Seller response integration (2026-09-28)

The existing service now follows analysis → operational next step/template or OpenAI candidate → deterministic reply risk → confidence/grounding → delivery state. Shared `DeliveryState` is separate from the existing operational `RecommendationAction`. There is one reply route for manual/suggested/edited/automatic modes, calling one service implementation; there is no parallel reply application. Existing decision route retains decline/handoff audit responsibility. Risk no longer prevents drafting or implies escalation to another person.

`repository.ts` materializes seed buyer messages idempotently into the same Mongo database. `mongodb.ts` exposes the messages collection using shared types. `inbox-service.ts` stores replies/status/audit/unread atomically with sequence ordering and request-id retry protection. Original buyer analysis inputs remain unchanged. Existing inbox components render history, a suggestion panel, always-present composer, approval controls and audit provenance. No new frontend component or database system was added.

No live OpenAI credentials were present: actual local UI uses reviewed templates with null confidence. Integration tests use an explicitly test-only Responses protocol stub to exercise real SDK handling and deterministic confidence/approval gates. This is not live generation validation. Future production sending requires authentication, authorization, connector delivery receipts and representative evaluation; none is implied by simulated delivery.

## Messaging presentation (2026-09-28)

Existing queue, thread, recommendation and context components own the three messaging work areas. History scrolls above a separate reply dock; context uses Analysis/Evidence/Activity tabs and the existing native dialog drawer. The app shell contains scrolling so keyboard focus does not displace the header or composer. Theme initialization lives in the existing root layout; the top-bar preference control updates shared CSS variables without another provider or dependency.

Inbox display previews/timestamps now come from the last sequenced persisted message. Priority/tie sorting and inference still use the original buyer thread fields. A Mongo aggregation in the existing inbox service performs this projection; no new endpoint, collection or duplicated summary type was introduced. The in-memory sample client mirrors latest-message presentation without adding persistence.

## Autonomous inbox integration (2026-09-28)

`inbox-service.ts` remains the authority for inbound analysis, generation, final policy, conversation state, settings/brief and reply persistence. `policy.mjs` adds bounded, fresh stock/tracking wording and generated-text/hostility/conflict gates. Shared contracts stay in `src/domain/contracts.ts`; model weights and priority rules are unchanged. `repository.ts` backfills absent revision/state metadata and jobs without rewriting historical messages or inventing migration activity.

The existing MongoDB database adds `processing_jobs`, `reply_deliveries`, and a single-workspace `workspace_settings` record. These are durable state within the current persistence system, not another queue service/database. Atomic job leases allow concurrent workers; unique event IDs/revisions and transactional proposal consumption prevent duplicate messages. Buyer ingress supersedes prior jobs and pending candidates. Settings version/fence plus thread revision protect generation and delivery races.

New responsibility owners: `autonomy.ts` claims jobs and calls the existing generator/send service; `transport.ts` exposes simulated delivery with deterministic receipts; `instrumentation.ts` starts the local worker on Node server startup; `scripts/process-inbox.mts` runs the same worker independently or once for scheduling. No independent policy/generator lives in the worker. UI GET polling reads persisted results. The new inbound/messages and autonomy/settings routes expose capabilities absent from previous routes; conversation PATCH and retry extend existing endpoints.

Opening brief reads structured audits `(lastSeenAt, asOf]`, current attention backlog and explicit conversation transitions. The displayed snapshot is stable while the header settings and inbox update. Acknowledgment advances only through displayed `asOf`. No order-update connector exists, so no fabricated order changes appear. These settings/lastSeen records are single-workspace prototype state; authenticated per-seller state is a production requirement.

Local browser verification uses the explicitly labeled `scripts/responses-fixture.mjs` protocol fixture, not live AI. A long-running Node server can run its interval worker; serverless processes require a dedicated worker or scheduler invoking the same durable jobs. Real connectors and receipt reconciliation are not implemented.
