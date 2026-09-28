import test from "node:test";
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { once } from "node:events";
import { createServer } from "node:http";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { MongoClient } from "mongodb";
import { replyTemplate } from "../src/server/policy.mjs";

const enabled = process.env.ESCALA_RUN_INTEGRATION === "1";
test("Escala reply workflow persists history/audit and enforces server-side policy", { skip: !enabled, timeout: 240_000 }, async () => {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: "8.2.6" } });
  const dbClient = new MongoClient(mongo.getUri());
  await dbClient.connect();
  const database = dbClient.db("escala_test");
  let server, output = "";
  const root = "http://127.0.0.1:3102";
  // Local Responses API protocol stub: tests the actual SDK adapter; not live AI.
  const mock = createServer(async (req, res) => {
    let raw = ""; for await (const chunk of req) raw += chunk;
    const input = JSON.parse(JSON.parse(raw).input);
    const template = replyTemplate(input.buyerMessage, input.evidence.map((item) => item.id));
    const candidate = { intent: template.intent, draft: template.draft,
      confidence: template.intent === "unknown" ? .4 : .96,
      missingInformation: [], evidenceIdsUsed: input.evidence.map((item) => item.id) };
    if (input.buyerMessage === "I want a refund.") candidate.draft = "Your refund has been issued.";
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ id: "resp_test", object: "response", status: "completed", output: [
      { id: "msg_test", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(candidate), annotations: [] }] },
    ] }));
  });
  mock.listen(0, "127.0.0.1"); await once(mock, "listening");
  const baseURL = `http://127.0.0.1:${mock.address().port}/v1`;
  async function start(useMock = false) {
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", "3102"], {
      cwd: process.cwd(), windowsHide: true,
      env: { ...process.env, MONGODB_URI: mongo.getUri(), MONGODB_DB: "escala_test", OPENAI_API_KEY: useMock ? "test-only-not-a-real-key" : "", OPENAI_BASE_URL: baseURL, ESCALA_ENABLE_EXTERNAL_SEND: "false" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    server.stdout.on("data", (data) => { output += data; });
    server.stderr.on("data", (data) => { output += data; });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null) throw new Error("Next server exited: " + output);
      try { if ((await fetch(root)).ok) return; } catch { /* startup */ }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error("Next startup timed out: " + output);
  }
  async function stop() {
    if (server && server.exitCode === null) { const exited = once(server, "exit"); server.kill(); await exited; }
  }
  async function request(path, body) {
    const response = await fetch(root + path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {});
    return { status: response.status, data: await response.json() };
  }
  async function recommend(id) {
    const response = await request(`/api/threads/${id}/recommendations`, {});
    assert.equal(response.status, 201, JSON.stringify(response.data));
    return response.data.recommendation;
  }
  const reply = (id, body) => request(`/api/threads/${id}/replies`, { requestId: crypto.randomUUID(), mode: "seller", ...body });
  try {
    await start();
    assert.equal((await request("/api/health")).data.services.database, "connected");
    const inbox = await request("/api/inbox");
    assert.equal(inbox.data.threads.length, 17);
    assert.deepEqual(inbox.data.threads.map((row) => row.priorityScore), inbox.data.threads.map((row) => row.priorityScore).sort((a, b) => b - a));
    const originalPriorities = inbox.data.threads.map(({ id, priorityScore }) => ({ id, priorityScore }));
    const hostileId = "thread-vn-hostile-001";
    const hostile = (await request(`/api/threads/${hostileId}`)).data;
    assert.equal(hostile.messages[0].text, "dit me may tra tien cho tao");
    assert.equal(hostile.thread.sentiment.source, "vietnamese_rules");
    assert.equal(hostile.thread.sentiment.label, "negative");
    assert.equal(hostile.thread.intent, "refund");
    assert.equal(hostile.thread.urgency, "low");
    assert.equal(hostile.thread.priorityScore, 85);
    assert.equal((await request("/api/threads/thread-vn-demand-001")).data.thread.priorityScore, 70);
    assert.equal((await request("/api/threads/thread-vn-factual-001")).data.thread.sentiment.label, "neutral");
    assert.equal((await request("/api/threads/thread-vn-positive-001")).data.thread.requiresAction, false);
    for (const [suffix, risk, sentiment, intent] of [
      ["black", "low", "neutral", "product_information"], ["wrong-size", "low", "neutral", "wrong_item"],
      ["shipment", "low", "negative", "order_status"], ["cancel", "high", "neutral", "cancellation"],
      ["refund", "high", "neutral", "refund"], ["uncertain", "low", null, "unknown"],
    ]) {
      const id = `thread-reply-${suffix}-001`, detail = (await request(`/api/threads/${id}`)).data;
      if (sentiment) assert.equal(detail.thread.sentiment.label, sentiment, suffix);
      assert.equal(detail.thread.intent, intent);
      const rec = await recommend(id);
      assert.equal(rec.risk, risk);
      assert.equal(rec.draftSource, "template");
      assert.equal(rec.confidence, null);
      assert.match(rec.modelNotice, /OPENAI_API_KEY is missing/);
      assert.ok(rec.draft.length > 20);
      assert.equal(rec.deliveryState, risk === "high" ? "APPROVAL_REQUIRED" : "REVIEW_REQUIRED");
      assert.doesNotMatch(rec.draft, /Your refund has been issued|I cancelled your order|replacement is on the way/);
      assert.equal((await reply(id, { recommendationId: rec.id, text: rec.draft, mode: "automatic" })).status, 409);
      if (risk === "high") {
        const blocked = await reply(id, { recommendationId: rec.id, text: rec.draft });
        assert.equal(blocked.data.error.code, "APPROVAL_REQUIRED");
        assert.equal((await database.collection("messages").countDocuments({ threadId: id, role: "seller" })), 0);
      }
    }
    const rec = await recommend(hostileId);
    const sent = await reply(hostileId, { text: rec.draft, recommendationId: rec.id, sellerApproved: true });
    assert.equal(sent.status, 200);
    assert.equal(sent.data.audit.reply.sellerApproved, true);
    assert.equal(sent.data.recommendation.status, "sent");
    assert.equal((await reply(hostileId, { text: rec.draft, recommendationId: rec.id, sellerApproved: true })).status, 409);
    assert.equal((await reply(hostileId, { text: "Please share your order number." })).data.error.code, "APPROVAL_REQUIRED");
    const editId = "thread-reply-wrong-size-001", editRec = await recommend(editId);
    const edited = await reply(editId, { text: "Please send a photo of the size label and your order number.", recommendationId: editRec.id });
    assert.equal(edited.status, 200);
    assert.equal(edited.data.audit.reply.originalDraft, editRec.draft);
    assert.equal(edited.data.audit.reply.edited, true);
    assert.equal(edited.data.audit.reply.finalText, edited.data.message.text);
    const manualId = "thread-vn-positive-001", requestId = crypto.randomUUID();
    const manual = await reply(manualId, { requestId, text: "Cảm ơn bạn nhé!" });
    assert.equal(manual.status, 200);
    assert.equal(manual.data.audit.reply.source, "manual");
    assert.equal(manual.data.recommendation, null);
    const latestInbox = (await request("/api/inbox")).data;
    assert.equal(latestInbox.threads.find((thread) => thread.id === manualId).preview, manual.data.message.text);
    assert.equal(latestInbox.threads.find((thread) => thread.id === manualId).updatedAt, manual.data.message.createdAt);
    assert.equal((await database.collection("threads").findOne({ id: manualId })).preview, "cảm ơn shop nha hàng đẹp lắm");
    assert.equal((await reply(manualId, { requestId, text: "Cảm ơn bạn nhé!" })).data.message.id, manual.data.message.id);
    assert.equal((await reply(manualId, { requestId, text: "Other reply" })).status, 409);
    assert.equal((await reply(manualId, { text: "We will refund your payment." })).data.error.code, "APPROVAL_REQUIRED");
    assert.equal((await reply(manualId, { text: "x".repeat(2001) })).status, 400);
    const declineId = "thread-reply-black-001", declineRec = await recommend(declineId);
    assert.equal((await request(`/api/recommendations/${declineRec.id}/decision`, { decision: "decline" })).status, 200);
    assert.equal((await reply(declineId, { text: declineRec.draft, recommendationId: declineRec.id })).status, 409);
    assert.equal((await reply(declineId, { text: "Which product are you asking about?" })).status, 200);
    const saved = await database.collection("threads").findOne({ id: hostileId });
    await request("/api/inbox");
    assert.equal((await database.collection("threads").findOne({ id: hostileId })).analyzedAt, saved.analyzedAt);
    const auditCount = await database.collection("audit").countDocuments();
    const refreshed = await promisify(execFile)(process.execPath, ["--import", "tsx", "scripts/refresh-analysis.mts"], {
      env: { ...process.env, MONGODB_URI: mongo.getUri(), MONGODB_DB: "escala_test" }, windowsHide: true,
    });
    assert.match(refreshed.stdout, /Refreshed 17/);
    assert.equal(await database.collection("audit").countDocuments(), auditCount);
    assert.equal((await database.collection("threads").findOne({ id: hostileId })).unread, false);
    const afterPriorities = (await request("/api/inbox")).data.threads.map(({ id, priorityScore }) => ({ id, priorityScore }));
    assert.deepEqual(afterPriorities, originalPriorities);
    await stop(); await start(true);
    for (const [id, text] of [[hostileId, rec.draft], [editId, edited.data.message.text], [manualId, manual.data.message.text]]) {
      const restored = (await request(`/api/threads/${id}`)).data;
      assert.equal(restored.messages[0].role, "buyer");
      assert.ok(restored.messages.some((message) => message.text === text && message.delivery === "simulated"));
      assert.ok(restored.audit.some((event) => event.reply?.finalText === text));
    }
    const auto = await recommend("thread-safe-001");
    assert.equal(auto.draftSource, "openai"); // protocol stub, not a real model run
    assert.equal(auto.deliveryState, "AUTO_SEND");
    assert.equal((await reply("thread-safe-001", { text: auto.draft + " Changed", recommendationId: auto.id, mode: "automatic" })).status, 409);
    const automaticallySent = await reply("thread-safe-001", { text: auto.draft, recommendationId: auto.id, mode: "automatic" });
    assert.equal(automaticallySent.status, 200, JSON.stringify(automaticallySent.data));
    assert.equal(automaticallySent.data.audit.actor, "system");
    const low = await recommend("thread-reply-uncertain-001");
    assert.equal(low.confidence, .4);
    assert.equal(low.draftSource, "openai");
    assert.equal(low.deliveryState, "REVIEW_REQUIRED");
    assert.ok(low.draft);
    assert.equal((await reply(low.threadId, { text: low.draft, recommendationId: low.id, mode: "automatic" })).status, 409);
    assert.equal((await reply(low.threadId, { text: low.draft, recommendationId: low.id })).status, 200);
    const riskyHigh = await recommend("thread-reply-cancel-001");
    assert.equal(riskyHigh.confidence, .96);
    assert.equal(riskyHigh.deliveryState, "APPROVAL_REQUIRED");
    assert.equal((await reply(riskyHigh.threadId, { text: riskyHigh.draft, recommendationId: riskyHigh.id, mode: "automatic", sellerApproved: true })).status, 409);
    const forbidden = await recommend("thread-reply-refund-001");
    assert.equal(forbidden.draftSource, "template");
    assert.notEqual(forbidden.draft, "Your refund has been issued.");
    assert.match(forbidden.modelNotice, /invalid\/unsafe/);
    assert.equal(await database.collection("threads").countDocuments(), 17);
  } finally {
    await stop(); await dbClient.close(); await mongo.stop();
    await new Promise((resolve) => mock.close(resolve));
  }
});
