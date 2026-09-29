import { getAutonomy, updateAutonomy, jsonError, ServiceError } from "@/server/inbox-service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return Response.json(await getAutonomy(), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return jsonError(error); }
}
export async function POST(request: Request) {
  try {
    let body;
    try { body = await request.json(); } catch { throw new ServiceError(400, "INVALID_JSON", "Provide valid autonomy settings."); }
    return Response.json(await updateAutonomy(body), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return jsonError(error); }
}
