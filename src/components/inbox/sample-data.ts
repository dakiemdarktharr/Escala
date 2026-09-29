import messages from "../../../data/demo/messages.json";
import knowledge from "../../../data/demo/knowledge-base.json";
import type {
  AuditRecord,
  EvidenceRecord,
  InboxThreadSummary,
  RecommendationAction,
  RecommendationRecord,
  SendReplyResponse,
  RiskLevel,
  ThreadDetailResponse,
} from "@/domain/contracts";
import { RequestError, type InboxClient } from "./api";

// Explicit UI preview only. Fixture expected* fields are illustrative oracles,
// never used to classify API data or make a production policy decision.
const sampleDrafts: Record<string, string | null> = {
  safe_faq:
    "Hi! Size M of the Blue Linen Shirt is currently listed as available. Standard delivery to Ho Chi Minh City is estimated at 2–4 business days after dispatch. This is an estimate, rather than a guaranteed arrival time.",
  ambiguous:
    "Could you share your order number, the item you’d like to exchange, and when it was delivered? I’ll check the exchange details for you.",
  high_risk_payment: "I’m sorry about the duplicate charge. I can review the payment issue. Could you confirm your order number?",
  urgent_deadline: "I understand the delivery deadline matters. I can check the order’s delivery information before confirming what is possible.",
  complaint_escalation: "I’m sorry about the experience. I can review your cancellation request. Could you confirm the order number?",
  missing_evidence: "Could you share the product model and the replacement part you need so I can check compatibility?",
  model_failure: "Thanks for your question. I’ll check the product care information before confirming washing instructions.",
};
const sampleSteps: Record<string, string> = {
  safe_faq: "Reply with product and delivery information",
  ambiguous: "Ask buyer for order and item details",
  high_risk_payment: "Review duplicate payment request",
  urgent_deadline: "Review delivery deadline",
  complaint_escalation: "Review cancellation request",
  missing_evidence: "Ask for product details",
  model_failure: "Check product care information",
};
const sampleRisk: Record<string, RiskLevel> = {
  safe_faq: "low",
  ambiguous: "medium",
  high_risk_payment: "high",
  urgent_deadline: "high",
  complaint_escalation: "high",
  missing_evidence: "medium",
  model_failure: "low",
};
const samplePriority: Record<string, number> = {
  safe_faq: 20,
  ambiguous: 45,
  high_risk_payment: 95,
  urgent_deadline: 85,
  complaint_escalation: 80,
  missing_evidence: 40,
  model_failure: 25,
};
const sampleNames = [
  "Minh Anh",
  "Thu Hà",
  "Gia Huy",
  "Bảo Ngọc",
  "Hoàng Nam",
  "Linh Đan",
  "Quốc Bảo",
];

function fixtures(): ThreadDetailResponse[] {
  return messages
    .map<ThreadDetailResponse>((message, index) => {
      const receivedAt = new Date(
        Date.now() - (messages.length - index) * 9 * 60_000,
      ).toISOString();
      const evidence: EvidenceRecord[] = knowledge
        .filter((entry) => message.expectedEvidenceIds.includes(entry.id))
        .map((entry) => ({
          id: entry.id,
          title: entry.title,
          snippet: entry.content,
          version: entry.version,
          source:
            entry.type === "product_facts" ? "product_faq" : "seller_policy",
        }));
      const timeSensitive = [
        "high_risk_payment",
        "urgent_deadline",
        "complaint_escalation",
      ].includes(message.scenario);
      const thread: InboxThreadSummary = {
        id: message.threadId,
        buyerName: sampleNames[index],
        preview: message.text,
        updatedAt: receivedAt,
        unread: true,
        intent: message.expectedIntent || "unknown",
        urgency: timeSensitive ? "high" : "low",
        urgencyReasons: [
          message.scenario === "high_risk_payment"
            ? "Buyer asks for a response immediately."
            : message.scenario === "urgent_deadline"
              ? "Buyer states a deadline of 5 PM tomorrow."
              : message.scenario === "complaint_escalation"
                ? "Buyer requests cancellation today."
                : "No explicit deadline in the sample message.",
        ],
        priorityScore: samplePriority[message.scenario],
        priorityReasons: message.expectedUrgencyReasons,
        requiresAction: true,
        contextRevision: 1,
        currentBuyerMessageId: message.id,
        conversationState: sampleRisk[message.scenario] === "high" ? "APPROVAL_REQUIRED" : "WAITING_FOR_SELLER_REVIEW",
        sentiment: {
          label: "unknown",
          confidence: null,
          source: "unavailable",
          language: "english",
          notice: "Sample preview does not run sentiment analysis.",
        },
        ...(message.scenario === "high_risk_payment"
          ? { orderId: "8831", productName: "Blue Linen Shirt" }
          : {}),
      };
      const recommendation: RecommendationRecord = {
        id: `sample-rec-${index}`,
        threadId: thread.id,
        action: message.expectedAction as RecommendationAction,
        intent: thread.intent,
        risk: sampleRisk[message.scenario],
        confidence: null,
        recommendedStep: sampleSteps[message.scenario],
        deliveryState: sampleRisk[message.scenario] === "high" ? "APPROVAL_REQUIRED" : "REVIEW_REQUIRED",
        confidenceThreshold: 0.9,
        draftSource: "template",
        status: "pending",
        contextRevision: 1,
        buyerMessageId: message.id,
        draft: sampleDrafts[message.scenario] || null,
        reasons: message.safeFallback
          ? [message.safeFallback]
          : message.expectedUrgencyReasons,
        evidence,
        policyVersion: "sample-preview-1",
        modelStatus: "fallback" as const,
        modelNotice:
          "This is a fixed sample template. No model was called; confidence is unavailable.",
        createdAt: receivedAt,
      };
      return {
        thread,
        messages: [
          {
            id: message.id,
            threadId: thread.id,
            role: "buyer",
            text: message.text,
            createdAt: receivedAt,
          },
        ],
        order:
          message.scenario === "high_risk_payment"
            ? {
                orderId: "8831",
                status: "Seller review needed",
                productName: "Blue Linen Shirt",
                quantity: 1,
                paymentStatus: "Buyer reports a duplicate charge; not verified",
              }
            : null,
        evidence,
        recommendation,
        audit: [
          {
            id: `sample-audit-${index}`,
            type: "recommendation",
            actor: "system",
            action: recommendation.action,
            reasonCodes: recommendation.reasons,
            evidenceIds: evidence.map((entry) => entry.id),
            createdAt: receivedAt,
          },
        ],
      };
    })
    .sort(
      (a, b) =>
        (b.thread.priorityScore ?? 0) - (a.thread.priorityScore ?? 0),
    );
}

/** Per-workspace, in-memory preview. A reload resets all preview decisions. */
export function createSampleClient(): InboxClient {
  const store = fixtures();
  const replies = new Map<string, SendReplyResponse>();
  return {
    async autonomy() { throw new RequestError("Autonomy is unavailable in the static sample preview."); },
    async updateAutonomy() { throw new RequestError("Connect workspace data to change autonomy."); },
    async retryReply() { throw new RequestError("Sample preview has no transport attempts to retry."); },
    async updateConversation(id, input) {
      const item = store.find((entry) => entry.thread.id === id);
      if (!item) throw new RequestError("Sample conversation not found.");
      item.thread.conversationState = input.state;
      item.thread.requiresAction = input.state !== "RESOLVED";
      item.audit.push({ id: crypto.randomUUID(), type: "conversation_state", actor: "seller", action: input.state, reasonCodes: ["Sample state only; resets on reload."], evidenceIds: [], createdAt: new Date().toISOString() });
      return structuredClone(item);
    },
    async inbox() {
      return {
        threads: store.map((entry) => ({ ...entry.thread })),
        counts: {
          all: store.length,
          needsReview: store.filter(
            (entry) =>
              !entry.audit.some((event) => event.type === "seller_decision"),
          ).length,
          urgent: store.filter((entry) => entry.thread.urgency === "high")
            .length,
        },
      };
    },
    async thread(id) {
      const item = store.find((entry) => entry.thread.id === id);
      if (!item) throw new Error("Sample not found");
      return structuredClone(item);
    },
    async recommend(id) {
      const item = store.find((entry) => entry.thread.id === id);
      if (!item?.recommendation) throw new Error("Sample not found");
      item.recommendation = {
        ...item.recommendation,
        id: `sample-rec-${crypto.randomUUID()}`,
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      const audit: AuditRecord = {
        id: crypto.randomUUID(),
        type: "recommendation",
        actor: "system",
        action: item.recommendation.action,
        reasonCodes: item.recommendation.reasons,
        evidenceIds: item.recommendation.evidence.map((entry) => entry.id),
        createdAt: item.recommendation.createdAt,
      };
      item.audit.push(audit);
      return structuredClone({ recommendation: item.recommendation, audit });
    },
    async decide(id, input) {
      const item = store.find((entry) => entry.recommendation?.id === id);
      if (!item?.recommendation) throw new Error("Sample not found");
      if (input.decision === "decline") item.recommendation.status = "declined";
      if ("editedDraft" in input && input.editedDraft)
        item.recommendation.draft = input.editedDraft;
      const audit: AuditRecord = {
        id: crypto.randomUUID(),
        type: "seller_decision",
        actor: "seller",
        action: input.decision,
        reasonCodes:
          input.decision === "escalate" && input.note
            ? [input.note]
            : ["Recorded in sample preview. No message sent."],
        evidenceIds: item.recommendation.evidence.map((entry) => entry.id),
        createdAt: new Date().toISOString(),
      };
      item.audit.push(audit);
      return structuredClone({ recommendation: item.recommendation, audit });
    },
    async reply(id, input) {
      const previous = replies.get(input.requestId);
      if (previous) return structuredClone(previous);
      const item = store.find((entry) => entry.thread.id === id);
      if (!item) throw new RequestError("Sample conversation not found.");
      const recommendation = input.recommendationId ? item.recommendation : null;
      if (input.recommendationId && (recommendation?.id !== input.recommendationId || recommendation.status !== "pending")) {
        throw new RequestError("This sample suggestion is no longer pending. Discard it and write a new reply.");
      }
      if (input.mode === "automatic") throw new RequestError("Sample templates have no model confidence and require seller review.");
      // Preview-only affordance; the API's deterministic policy remains authoritative.
      const risky = item.recommendation?.risk === "high" || /refund|cancel|payment|discount|compensat|guarantee|replace|reship/i.test(input.text);
      if (risky && !input.sellerApproved) throw new RequestError("Approve this sensitive reply before sending.", "APPROVAL_REQUIRED");
      if (input.sellerApproved && input.approvedText !== input.text.trim()) throw new RequestError("Approve the exact current reply.", "APPROVAL_REQUIRED");
      const createdAt = new Date().toISOString();
      const message = {
        id: crypto.randomUUID(), threadId: id, role: "seller" as const,
        text: input.text.trim(), createdAt, delivery: "simulated" as const,
        requestId: input.requestId, recommendationId: input.recommendationId,
      };
      const edited = Boolean(recommendation && recommendation.draft !== message.text);
      const audit: AuditRecord = {
        id: crypto.randomUUID(), threadId: id, type: "seller_decision", actor: "seller",
        action: "reply_sent", reasonCodes: ["Sample reply only. Resets on reload."],
        evidenceIds: recommendation?.evidence.map((entry) => entry.id) ?? [], createdAt,
        reply: {
          messageId: message.id, originalDraft: recommendation?.draft ?? null,
          finalText: message.text, edited, source: recommendation ? edited ? "edited_suggestion" : "suggestion" : "manual",
          risk: risky ? "high" : "low", deliveryState: risky ? "APPROVAL_REQUIRED" : "REVIEW_REQUIRED",
          confidence: recommendation?.confidence ?? null, sellerApproved: Boolean(input.sellerApproved), delivery: "simulated",
        },
      };
      if (recommendation) recommendation.status = "sent";
      item.messages.push(message);
      item.thread.preview = message.text;
      item.thread.updatedAt = createdAt;
      item.thread.conversationState = "WAITING_FOR_BUYER";
      item.thread.requiresAction = false;
      item.audit.push(audit);
      const result = { message, audit, recommendation };
      replies.set(input.requestId, structuredClone(result));
      return structuredClone(result);
    },
  };
}
