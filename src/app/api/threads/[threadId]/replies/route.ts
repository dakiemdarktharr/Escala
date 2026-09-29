import type { SendReplyInput } from "@/domain/contracts";
import { jsonError, sendReply, retryReply, ServiceError } from "@/server/inbox-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ threadId: string }> }) {
  try {
    let body: SendReplyInput & { retryAttemptId?: string };
    try { body = await request.json(); }
    catch { throw new ServiceError(400, "INVALID_JSON", "Provide a valid JSON reply."); }
    const { threadId } = await context.params;
    if (body.retryAttemptId) return Response.json(await retryReply(threadId, body.retryAttemptId), { headers: { "Cache-Control": "no-store" } });
    return Response.json(await sendReply(threadId, body), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return jsonError(error); }
}
