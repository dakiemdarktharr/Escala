# Escala reply policy

Runtime policy version: `escala-policy-4.0`. Deterministic policy governs both candidate eligibility and final delivery. Refunds and cancellations require exact seller approval.

## Independent properties

Sentiment is tone; intent is what the buyer wants; temporal urgency is time pressure; priority ranks attention. Reply confidence and deterministic business risk are separate. None of sentiment, urgency or priority authorizes delivery. Existing priority weights and Vietnamese routing/tone rules are preserved.

## Delivery state

| State | Conditions | Seller workflow |
| --- | --- | --- |
| `MANUAL_ONLY` | No usable draft | Always-present manual composer; sensitive replies still need explicit approval |
| `APPROVAL_REQUIRED` | Refund, payment, cancellation, order change, compensation/discount, replacement/reshipment side effect, delivery commitment, legal/public threat, safety/security or existing policy-sensitive category | Draft remains visible; Approve & send, Edit, Decline, or write a new reply |
| `AUTO_SEND` | Low risk, valid confidence at/above threshold, reviewed exact wording, required current evidence, known intent, no missing facts, successful candidate | Worker sends only while persisted backend mode is ON; DRAFT_ONLY holds a prepared draft |
| `REVIEW_REQUIRED` | Safe draft with low/unavailable confidence, uncertain intent, incomplete grounding or unreviewed free-form wording | Suggestion remains visible; send after review, edit, decline or write manually |

Risk and confidence are independent. A high-confidence refund remains approval-required; a risky low-confidence reply shows both reasons. Ordinary complaint acknowledgements and shipment-status questions are low risk unless other policy-sensitive signals appear. An explicit "not a guarantee" disclaimer in reply wording is not a commitment; an actual buyer request for a guarantee is checked unchanged.

`ESCALA_CONFIDENCE_THRESHOLD` defaults to `0.90`, inclusive. Allowed configuration is 0.90–1.00. Invalid configuration disables automation. Confidence is a model self-report, not calibrated probability, sentiment confidence, or a validation score. Fallback templates have null confidence and never qualify for automatic delivery.

## Drafting and grounding

The existing OpenAI Responses adapter drafts even for risky messages. Raw buyer text is untrusted input. It uses supplied evidence, may acknowledge problems or ask for missing information without inventing product facts, and is told that no refund/cancellation/order action has occurred. Deterministic checks reject recognized completed-action/commitment claims and malformed output. Regex checks are not exhaustive natural-language verification: arbitrary free-form drafts remain seller-reviewed. Automatic delivery requires exact reviewed wording and all required evidence; missing product details lead to a question, not invented stock availability.

No `OPENAI_API_KEY` means no live generation. The notice names that missing variable. Reviewed English/Vietnamese fallback templates are explicitly labeled templates with confidence unavailable, not fake AI output. Model failure/invalid output also yields a labeled fallback. The seller can always reply manually.

## Authoritative send gate

One route, `POST /api/threads/:threadId/replies`, handles all reply modes and retries. It checks final edited text, current threshold, proposal ownership/status/version, conversation revision, evidence fingerprint, exact proposal hash, automatic eligibility and exact sensitive-action approval. Approval must include `approvedText` equal to the trimmed final reply and current `contextRevision`. New buyer context, changed evidence, consumed proposals and text edits cannot reuse old approval. Seller approval of a communication executes no refund/cancellation or marketplace operation.

The simplified UI collects sensitive approval in a confirmation dialog rather than a permanent checkbox. The dialog displays the exact final text and retains its context snapshot; changing text or relevant conversation state invalidates confirmation. This is a presentation change: the same final server policy and `sellerApproved` / `approvedText` / `contextRevision` contract remain authoritative. Keyboard sending uses the same confirmation flow.

Every request has a client request ID. A retry returns the existing message; reuse for different content is rejected. Sending a suggestion consumes its pending state atomically, so duplicate sends/declined/obsolete suggestions are blocked. Manual replies remain available after a suggestion is consumed. The existing decision route records decline or explicit handoff decisions; historical approve/edit decisions no longer imply a delivery.

## Persistence and audit

MongoDB remains the only store. Seed buyer messages are idempotently materialized into its `messages` collection. Seller replies use the same shared `MessageRecord`, persist with simulated delivery, and receive a monotonic per-thread sequence (fixture dates are synthetic and may be in the future). A transaction saves message, audit, pending-status transition, and unread state together. A Mongo replica set is required for transactions.

The existing audit retains original draft, final text, edited flag, source, confidence, delivery state, risk, explicit seller approval, evidence IDs, policy version, timestamp and message ID. Decline gets an event too. Buyer text and timestamps remain the inputs to cached triage; sending does not silently rewrite queue priority. Restarting Next.js against the same Mongo database retains all messages/events.

## Background operation and failures

MongoDB processing jobs have unique inbound event/revision identities and expiring atomic leases. New buyer messages invalidate prior pending recommendations and jobs. ON permits eligible automatic delivery; DRAFT_ONLY prepares without sending; PAUSED prohibits automatic processing/sending. Settings versions and a transaction fence reject mode changes during generation/delivery. Explicit seller manual/escalated/resolved dispositions remain held across mode changes. Generation/classifier failure, unknown or low-score English sentiment, conflicting intent/citations, expired/mismatched trusted context and policy failures cannot auto-send. Hostile wording is held separately from sentiment; an angry factual tracking request can still receive verified information.

`ReplyTransport` is simulated only. Durable delivery records move QUEUED → SENDING → SENT/FAILED. Failures retain the proposal, create no seller message, and expose retry using the same attempt identity. Same request returns the existing message after successful retry. Automatic attribution, provider receipt, original/final text, exact approval/context, raw prohibited proposal and optional later correction reference are persisted. Real adapters require provider idempotency/reconciliation; a database transaction cannot guarantee an external network send exactly once.

The seller brief aggregates structured audit timestamps and current conversation backlog. Only explicit seller state transitions count as resolved/escalated; a sent reply means waiting for buyer, not resolution. No order updates are inferred from candidate text. Last-seen acknowledgment covers only the displayed snapshot; GET reads never generate or send.

External sends and all order mutations remain unimplemented, even if an environment flag is changed. Local replies are simulated only. Authentication, production authorization and connector delivery receipts are future work; this synthetic demo is not ready for public multi-user operation.
