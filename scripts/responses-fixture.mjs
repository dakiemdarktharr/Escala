import { createServer } from "node:http";
import { once } from "node:events";
import { pathToFileURL } from "node:url";
import { replyTemplate } from "../src/server/policy.mjs";

/** Local SDK protocol fixture. No AI inference, credentials or external calls. */
export async function startResponsesStub(port = 0, mutate = () => {}) {
  const server = createServer(async (req, res) => {
    try {
      let raw = ""; for await (const chunk of req) raw += chunk;
      const input = JSON.parse(JSON.parse(raw).input);
      const template = replyTemplate(input.buyerMessage, input.evidence.map(item => item.id));
      const candidate = { intent: template.intent, draft: input.reviewedDraft ?? template.draft,
        confidence: template.intent === "unknown" ? .4 : .96, missingInformation: [],
        evidenceIdsUsed: input.evidence.map(item => item.id) };
      await mutate(candidate, input);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ id: "resp_test", object: "response", status: "completed", output: [
        { id: "msg_test", type: "message", role: "assistant", status: "completed",
          content: [{ type: "output_text", text: JSON.stringify(candidate), annotations: [] }] },
      ] }));
    } catch {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "Local test stub rejected request" } }));
    }
  });
  server.listen(port, "127.0.0.1"); await once(server, "listening");
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.argv[2] ?? 3130);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Provide a local test port");
  await startResponsesStub(port);
  console.log(`Local Responses test stub: http://127.0.0.1:${port}/v1 — no live AI`);
}
