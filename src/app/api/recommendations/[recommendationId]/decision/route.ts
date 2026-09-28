import type { SellerDecisionInput } from "@/domain/contracts";
import { jsonError, recordSellerDecision, ServiceError } from "@/server/inbox-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isDecisionInput(value: unknown): value is SellerDecisionInput {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.decision === "approve") return true;
  if (candidate.decision === "escalate" || candidate.decision === "decline") return candidate.note === undefined || (typeof candidate.note === "string" && candidate.note.length <= 500);
  if (candidate.decision === "edit" || candidate.decision === "ask_clarification") {
    return typeof candidate.editedDraft === "string" && candidate.editedDraft.trim().length > 0 && candidate.editedDraft.length <= 2000;
  }
  return false;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ recommendationId: string }> },
): Promise<Response> {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ServiceError(400, "INVALID_JSON", "Provide a valid JSON decision.");
    }
    if (!isDecisionInput(body)) throw new ServiceError(400, "INVALID_DECISION", "Choose a valid seller decision and provide any required draft text.");
    const { recommendationId } = await context.params;
    return Response.json(await recordSellerDecision(recommendationId, body), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
