import messages from "../../../data/demo/messages.json";
import knowledge from "../../../data/demo/knowledge-base.json";
import type {
  AuditRecord,
  EvidenceRecord,
  InboxThreadSummary,
  RecommendationAction,
  RiskLevel,
  ThreadDetailResponse,
} from "@/domain/contracts";
import type { InboxClient } from "./api";

// Explicit UI preview only. Fixture expected* fields are illustrative oracles,
// never used to classify API data or make a production policy decision.
const sampleDrafts: Record<string, string | null> = {
  safe_faq:
    "Hi! Size M of the Blue Linen Shirt is currently listed as available. Standard delivery to Ho Chi Minh City is estimated at 2–4 business days after dispatch. This is an estimate, rather than a guaranteed arrival time.",
  ambiguous:
    "Could you share your order number, the item you’d like to exchange, and when it was delivered? I’ll check the exchange details for you.",
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
      const recommendation = {
        id: `sample-rec-${index}`,
        threadId: thread.id,
        action: message.expectedAction as RecommendationAction,
        intent: thread.intent,
        risk: sampleRisk[message.scenario],
        confidence: message.modelStatus === "FAILED" ? null : 0.94,
        draft: sampleDrafts[message.scenario] || null,
        reasons: message.safeFallback
          ? [message.safeFallback]
          : message.expectedUrgencyReasons,
        evidence,
        policyVersion: "sample-preview-1",
        modelStatus: "fallback" as const,
        modelNotice:
          message.modelStatus === "FAILED"
            ? "The model was unavailable. No answer was generated; review the evidence and write a draft."
            : "This is a fixed sample recommendation. No model was called.",
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
  return {
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
  };
}
