/** Shared wire contracts for the Escala MVP API and seller inbox UI. */

export type RiskLevel = "low" | "medium" | "high";
export type DeliveryState = "AUTO_SEND" | "APPROVAL_REQUIRED" | "REVIEW_REQUIRED" | "MANUAL_ONLY";
export type AutonomyMode = "ON" | "DRAFT_ONLY" | "PAUSED";
export type ConversationState = "AWAITING_PROCESSING" | "AUTO_HANDLED" | "WAITING_FOR_BUYER" | "WAITING_FOR_SELLER_REVIEW" | "APPROVAL_REQUIRED" | "RESOLVED" | "ESCALATED" | "SEND_FAILED";
export type TransportState = "QUEUED" | "SENDING" | "SENT" | "FAILED";
export interface AutonomySettings { mode: AutonomyMode; version: number; updatedAt: string }
export interface BriefEvent { id: string; threadId: string; buyerName: string; action: string; text?: string; reasons: string[]; createdAt: string }
export interface AutonomyBrief {
  since: string | null; asOf: string; firstVisit: boolean;
  counts: { incoming: number; automaticReplies: number; needsReview: number; approvalRequired: number; resolved: number; failed: number; escalated: number };
  events: BriefEvent[];
  orderUpdates: BriefEvent[];
}
export interface AutonomyResponse { settings: AutonomySettings; brief: AutonomyBrief }
export interface AutonomyUpdateInput { mode?: AutonomyMode; expectedVersion?: number; visitThrough?: string }
/** Trusted repository context, never inferred from buyer text or candidate output. */
export interface VerifiedReplyContext {
  stock?: { productName: string; size: string; available: boolean; evidenceId: string; observedAt: string; validUntil: string };
  tracking?: { orderId: string; status: string; evidenceId: string; observedAt: string; validUntil: string };
}
export interface SentimentAnalysis {
  label: "negative" | "neutral" | "positive" | "unknown";
  confidence: number | null;
  source: "local_english_model" | "vietnamese_rules" | "unavailable";
  language: "english" | "vietnamese" | "mixed" | "unknown";
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
  conversationState?: ConversationState;
  stateReasons?: string[];
  contextRevision?: number;
  currentBuyerMessageId?: string;
  autonomyDecision?: DeliveryState;
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
  delivery?: "simulated";
  recommendationId?: string;
  requestId?: string;
  sequence?: number;
  sentBy?: "seller" | "escala";
  providerMessageId?: string;
  transportState?: TransportState;
  receivedAt?: string;
  inboundEventId?: string;
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
  type: "recommendation" | "seller_decision" | "inbound" | "autonomy" | "transport" | "conversation_state";
  actor: "system" | "seller";
  action: string;
  reasonCodes: string[];
  evidenceIds: string[];
  createdAt: string;
  contextRevision?: number;
  buyerMessageId?: string;
  transportState?: TransportState;
  attemptedText?: string;
  reply?: {
    messageId: string;
    originalDraft: string | null;
    finalText: string;
    edited: boolean;
    source: "manual" | "suggestion" | "edited_suggestion" | "automatic";
    risk: RiskLevel;
    deliveryState: DeliveryState;
    confidence: number | null;
    sellerApproved: boolean;
    delivery: "simulated";
    approvedText?: string;
    contextRevision?: number;
    providerMessageId?: string;
    correctedMessageId?: string;
  };
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
  recommendedStep: string;
  deliveryState: DeliveryState;
  confidenceThreshold: number;
  draftSource: "openai" | "template" | "none";
  status: "pending" | "sent" | "declined";
  contextRevision?: number;
  buyerMessageId?: string;
  proposalHash?: string;
  contextFingerprint?: string;
  automaticGrounded?: boolean;
  generationProvider?: "openai" | "test_stub" | "template";
}

export interface SendReplyInput {
  requestId: string;
  text: string;
  recommendationId?: string;
  mode: "seller" | "automatic";
  sellerApproved?: boolean;
  approvedText?: string;
  contextRevision?: number;
  correctedMessageId?: string;
}
export interface SendReplyResponse {
  message: MessageRecord;
  audit: AuditRecord;
  recommendation: RecommendationRecord | null;
}

export interface ThreadDetailResponse {
  thread: InboxThreadSummary;
  messages: MessageRecord[];
  order: OrderContext | null;
  evidence: EvidenceRecord[];
  recommendation: RecommendationRecord | null;
  audit: AuditRecord[];
  deliveries?: ReplyAttempt[];
}
export interface ReplyAttempt {
  id: string; threadId: string; requestId: string; text: string; mode: "seller" | "automatic";
  state: TransportState; recommendationId?: string; contextRevision: number;
  providerMessageId?: string; error?: string; createdAt: string; updatedAt: string;
}
export interface InboundMessageInput { eventId: string; text: string; buyerName?: string }
export interface InboundMessageResponse { message: MessageRecord; duplicate: boolean }
export interface ConversationUpdateInput { state: "RESOLVED" | "ESCALATED" | "WAITING_FOR_SELLER_REVIEW"; contextRevision: number }

export interface CreateRecommendationResponse {
  recommendation: RecommendationRecord;
  audit: AuditRecord;
}

export type SellerDecisionInput =
  | { decision: "approve"; editedDraft?: never }
  | { decision: "edit"; editedDraft: string }
  | { decision: "ask_clarification"; editedDraft: string }
  | { decision: "escalate"; note?: string }
  | { decision: "decline"; note?: string };

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
