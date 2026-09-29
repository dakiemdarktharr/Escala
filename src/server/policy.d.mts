import type { RecommendationAction, InboxThreadSummary, SentimentAnalysis, DeliveryState, RiskLevel, VerifiedReplyContext } from "@/domain/contracts";
export function replyTemplate(text: string, evidenceIds?: string[]): { intent: string; recommendedStep: string; draft: string };
export function hasUnverifiedActionClaim(draft: string): boolean;
export function replyDeliveryDecision(input: { text: string; draft: string | null; confidence: number | null; threshold?: number; automaticGrounded?: boolean; uncertain?: boolean }): { deliveryState: DeliveryState; risk: RiskLevel; reasons: string[] };
export function groundedReply(text: string, context?: VerifiedReplyContext, evidenceIds?: string[], now?: Date): {draft: string; evidenceIds: string[]} | null;

export function detectHardRisk(text: string, scenario?: string): { hard: boolean; reasons: string[] };

export function evaluateRecommendation(input: {
  text: string;
  scenario: string;
  confidence: number | null;
  missingInformation?: string[];
  evidenceIds?: string[];
  threshold?: number;
  hasApprovedAnswer?: boolean;
  sentiment?: SentimentAnalysis;
}): { action: RecommendationAction; reasons: string[] };

export const APPROVED_AVAILABILITY_ANSWER: string;
export const ANALYSIS_VERSION: string;
export function normalizeText(text: string): string;
export function routeLanguage(text: string): SentimentAnalysis["language"];
export function vietnameseSentiment(text: string): "negative" | "neutral" | "positive";
export function detectIntent(text: string): string;
export function refreshPriority(analysis: Pick<InboxThreadSummary, "priorityScore" | "priorityReasons" | "requiresAction">, receivedAt: string, now?: Date): Pick<InboxThreadSummary, "priorityScore" | "priorityReasons">;
export function analyzeTriage(text: string, sentiment: SentimentAnalysis, receivedAt: string, now?: Date): Pick<InboxThreadSummary, "intent" | "sentiment" | "requiresAction" | "urgency" | "urgencyReasons" | "priorityFlag" | "priorityScore" | "priorityReasons">;
