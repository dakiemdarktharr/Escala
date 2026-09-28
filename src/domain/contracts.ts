/** Shared wire contracts for the Escala MVP API and seller inbox UI. */

export type RiskLevel = "low" | "medium" | "high";
export interface SentimentAnalysis {
  label: "negative" | "neutral" | "positive" | "unknown";
  confidence: number | null;
  source: "local_english_model" | "vietnamese_rules" | "unavailable";
  language: "english" | "vietnamese" | "mixed";
  modelId?: string;
  notice?: string;
}
export type RecommendationAction =
  | "AUTO_REPLY"
  | "DRAFT_FOR_SELLER"
  | "ASK_CLARIFICATION"
  | "ESCALATE";

export interface InboxThreadSummary {
  id: string;
  buyerName: string;
  preview: string;
  updatedAt: string;
  unread: boolean;
  intent: string;
  urgency: RiskLevel;
  urgencyReasons: string[];
  sentiment?: SentimentAnalysis;
  requiresAction?: boolean;
  priorityScore?: number;
  priorityReasons?: string[];
  priorityFlag?: "abusive_language" | "direct_money_demand" | null;
  orderId?: string;
  productName?: string;
}

export interface InboxResponse {
  threads: InboxThreadSummary[];
  counts: { all: number; needsReview: number; urgent: number };
}

export interface MessageRecord {
  id: string;
  threadId: string;
  role: "buyer" | "seller" | "system";
  text: string;
  createdAt: string;
}

export interface OrderContext {
  orderId: string;
  status: string;
  productName: string;
  quantity: number;
  paymentStatus?: string;
  deliveryDeadline?: string;
}

export interface EvidenceRecord {
  id: string;
  title: string;
  snippet: string;
  version: string;
  source: "seller_policy" | "product_faq" | "order_context";
}

export interface AuditRecord {
  id: string;
  threadId?: string;
  policyVersion?: string;
  type: "recommendation" | "seller_decision";
  actor: "system" | "seller";
  action: string;
  reasonCodes: string[];
  evidenceIds: string[];
  createdAt: string;
}

export interface RecommendationRecord {
  id: string;
  threadId: string;
  action: RecommendationAction;
  intent: string;
  risk: RiskLevel;
  confidence: number | null;
  draft: string | null;
  reasons: string[];
  evidence: EvidenceRecord[];
  policyVersion: string;
  modelStatus: "live" | "fallback";
  modelNotice?: string;
  createdAt: string;
}

export interface ThreadDetailResponse {
  thread: InboxThreadSummary;
  messages: MessageRecord[];
  order: OrderContext | null;
  evidence: EvidenceRecord[];
  recommendation: RecommendationRecord | null;
  audit: AuditRecord[];
}

export interface CreateRecommendationResponse {
  recommendation: RecommendationRecord;
  audit: AuditRecord;
}

export type SellerDecisionInput =
  | { decision: "approve"; editedDraft?: never }
  | { decision: "edit"; editedDraft: string }
  | { decision: "ask_clarification"; editedDraft: string }
  | { decision: "escalate"; note?: string };

export interface SellerDecisionResponse {
  audit: AuditRecord;
  recommendation: RecommendationRecord;
}

export interface HealthResponse {
  status: "ok" | "degraded";
  services: { database: "connected" | "unavailable"; llm: "configured" | "fallback" };
  timestamp: string;
}

export interface ApiErrorResponse {
  error: { code: string; message: string };
}

/**
 * GET /api/inbox
 * GET /api/threads/:threadId
 * POST /api/threads/:threadId/recommendations
 * POST /api/recommendations/:recommendationId/decision
 * GET /api/health
 */
