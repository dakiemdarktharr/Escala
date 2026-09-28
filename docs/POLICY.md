# Escala reply policy

Runtime policy version: `escala-policy-3.0`. The seller is already the reviewing person. Refunds and cancellations require seller approval, not a default handoff to another person.

## Independent properties

Sentiment is tone; intent is what the buyer wants; temporal urgency is time pressure; priority ranks attention. Reply confidence and deterministic business risk are separate. None of sentiment, urgency or priority authorizes delivery. Existing priority weights and Vietnamese routing/tone rules are preserved.

## Delivery state

| State | Conditions | Seller workflow |
| --- | --- | --- |
| `MANUAL_ONLY` | No usable draft | Always-present manual composer; sensitive replies still need explicit approval |
| `APPROVAL_REQUIRED` | Refund, payment, cancellation, order change, compensation/discount, replacement/reshipment side effect, delivery commitment, legal/public threat, safety/security or existing policy-sensitive category | Draft remains visible; Approve & send, Edit, Decline, or write a new reply |
| `AUTO_SEND` | Low risk, valid confidence at/above threshold, reviewed exact wording, required retrieved evidence, known intent, no missing facts, live successful candidate | Eligible for simulated automatic sending; seller can send/edit/decline before delivery |
| `REVIEW_REQUIRED` | Safe draft with low/unavailable confidence, uncertain intent, incomplete grounding or unreviewed free-form wording | Suggestion remains visible; send after review, edit, decline or write manually |

Risk and confidence are independent. A high-confidence refund remains approval-required; a risky low-confidence reply shows both reasons. Ordinary complaint acknowledgements and shipment-status questions are low risk unless other policy-sensitive signals appear. An explicit "not a guarantee" disclaimer in reply wording is not a commitment; an actual buyer request for a guarantee is checked unchanged.

`ESCALA_CONFIDENCE_THRESHOLD` defaults to `0.90`, inclusive. Allowed configuration is 0.90–1.00. Invalid configuration disables automation. Confidence is a model self-report, not calibrated probability, sentiment confidence, or a validation score. Fallback templates have null confidence and never qualify for automatic delivery.

## Drafting and grounding

The existing OpenAI Responses adapter drafts even for risky messages. Raw buyer text is untrusted input. It uses supplied evidence, may acknowledge problems or ask for missing information without inventing product facts, and is told that no refund/cancellation/order action has occurred. Deterministic checks reject recognized completed-action/commitment claims and malformed output. Regex checks are not exhaustive natural-language verification: arbitrary free-form drafts remain seller-reviewed. Automatic delivery requires exact reviewed wording and all required evidence; missing product details lead to a question, not invented stock availability.

No `OPENAI_API_KEY` means no live generation. The notice names that missing variable. Reviewed English/Vietnamese fallback templates are explicitly labeled templates with confidence unavailable, not fake AI output. Model failure/invalid output also yields a labeled fallback. The seller can always reply manually.

## Authoritative send gate

One route, `POST /api/threads/:threadId/replies`, handles all reply modes. It checks the thread, final edited text, current threshold, recommendation ownership/status/version, automatic eligibility and explicit sensitive-action approval. Changing a safe draft to a refund or commitment cannot bypass approval. Low-confidence or edited suggestions cannot use automatic mode. Seller approval of a communication does not execute the underlying refund/cancellation or any marketplace operation.

Every request has a client request ID. A retry returns the existing message; reuse for different content is rejected. Sending a suggestion consumes its pending state atomically, so duplicate sends/declined/obsolete suggestions are blocked. Manual replies remain available after a suggestion is consumed. The existing decision route records decline or explicit handoff decisions; historical approve/edit decisions no longer imply a delivery.

## Persistence and audit

MongoDB remains the only store. Seed buyer messages are idempotently materialized into its `messages` collection. Seller replies use the same shared `MessageRecord`, persist with simulated delivery, and receive a monotonic per-thread sequence (fixture dates are synthetic and may be in the future). A transaction saves message, audit, pending-status transition, and unread state together. A Mongo replica set is required for transactions.

The existing audit retains original draft, final text, edited flag, source, confidence, delivery state, risk, explicit seller approval, evidence IDs, policy version, timestamp and message ID. Decline gets an event too. Buyer text and timestamps remain the inputs to cached triage; sending does not silently rewrite queue priority. Restarting Next.js against the same Mongo database retains all messages/events.

External sends and all order mutations remain unimplemented, even if an environment flag is changed. Local replies are simulated only. Authentication, production authorization and connector delivery receipts are future work; this synthetic demo is not ready for public multi-user operation.
