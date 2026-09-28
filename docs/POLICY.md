# Escala Policy & Action Engine

## Purpose

The policy engine is the deterministic safety boundary between model suggestions and seller-facing actions. It is independently testable and must remain authoritative even when an LLM produces a confident answer.

## Hard-risk categories

Any of these signals blocks automatic sending:

- refund, payment, charge, or financial dispute;
- cancellation or order-state mutation;
- legal, safety, regulatory, or health complaint;
- account, identity, credential, privacy, or security issue;
- exceptional discount, compensation, or unauthorized commitment;
- legal, safety, or regulatory complaint;
- account, identity, credential, or security issue;
- exceptional discount, compensation, or unauthorized commitment;
- threat of public complaint or escalation;
- missing, conflicting, or unreliable evidence;
- low confidence or a failed grounding check;
- a requested external side effect that has not been approved.

## Rule precedence

```text
if hard_risk_flag:
    ESCALATE
else if missing_required_information:
    ASK_CLARIFICATION
else if grounded_faq and confidence >= threshold and no_risk_flag:
    AUTO_REPLY
else:
    DRAFT_FOR_SELLER
```

Hard-risk rules take precedence over model confidence. Fuzzy similarity, sentiment, and urgency signals can inform explanations but cannot independently grant permission to auto-send.

## Action requirements

### `AUTO_REPLY`

Requires routine FAQ intent, reliable evidence, a grounded draft, confidence at or above the configured threshold, and no hard-risk or unauthorized promise.

### `DRAFT_FOR_SELLER`

Used for medium confidence, mild ambiguity, or a safe draft that still needs seller confirmation. The UI shows the draft, evidence, detected intent, confidence, and approval reason.

### `ASK_CLARIFICATION`

Used when a necessary order, product, quantity, date, or other fact is missing. The system asks one targeted question and does not guess.

### `ESCALATE`

Used for hard-risk, unsupported, contradictory, out-of-scope, or side-effect cases. The recommendation includes risk factors, urgency, evidence or evidence absence, and a suggested next step.

## Urgency explanation

As of policy `escala-policy-2.0`, the runtime UI distinguishes temporal urgency from business risk and queue priority. Explicit deadlines/time pressure raise urgency. A refund's financial risk does not itself invent a deadline. Cached intent, negative sentiment, abusive-language/direct-demand flags, and waiting time raise attention priority with visible reasons. Refund and order-action rules still block automation, including accented and unaccented Vietnamese. Unknown or negative sentiment cannot grant automatic replies, and an invalid/below-0.90 configured threshold fails closed. Seller reply decisions on high-risk/escalated recommendations are rejected by the API; escalation remains available.

The prototype ranks urgency from visible signals:

- delivery or response deadline;
- payment or financial impact;
- order-status risk;
- complaint or escalation language;
- customer sentiment;
- time waiting without response;
- likelihood of irreversible loss or reputational damage.

The UI must show both a priority level and the reasons, for example: “High urgency — delivery deadline within 24 hours, customer requests cancellation, and payment status is unresolved.” Do not present the rank as a validated business metric.

## Safe fallback

When no reliable evidence is retrieved or the model fails, the system must not fabricate a response. It displays a clear limitation such as “No verified answer generated; seller review required,” records the failure reason, and selects a non-automatic action.

## Audit requirements

Record one audit event for every recommendation and every seller decision, including policy version, evidence IDs, reason codes, urgency factors, action, timestamp, and whether a draft was approved, edited, rejected, or escalated.
