import { receiveBuyerMessage, jsonError, ServiceError } from "@/server/inbox-service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ threadId: string }> }) {
  try {
    let body;
    try { body = await request.json(); } catch { throw new ServiceError(400, "INVALID_JSON", "Provide a valid buyer event."); }
    const result = await receiveBuyerMessage((await context.params).threadId, body);
    return Response.json(result, { status: result.duplicate ? 200 : 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return jsonError(error); }
}
