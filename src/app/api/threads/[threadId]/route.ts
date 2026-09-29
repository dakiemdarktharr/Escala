import { getThreadDetail, jsonError, updateConversation, ServiceError } from "@/server/inbox-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ threadId: string }> },
): Promise<Response> {
  try {
    const { threadId } = await context.params;
    return Response.json(await getThreadDetail(threadId), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ threadId: string }> }) {
  try {
    let body;
    try { body = await request.json(); } catch { throw new ServiceError(400, "INVALID_JSON", "Provide a valid state update."); }
    return Response.json(await updateConversation((await context.params).threadId, body), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return jsonError(error); }
}
