import test from "node:test";
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { once } from "node:events";
import { startResponsesStub } from "../scripts/responses-fixture.mjs";
import { ANALYSIS_VERSION } from "../src/server/policy.mjs";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { MongoClient } from "mongodb";

const enabled = process.env.ESCALA_RUN_INTEGRATION === "1";
test("Escala reply workflow and autonomous jobs persist history/audit and enforce server-side policy", { skip: !enabled, timeout: 360_000 }, async (t) => {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: "8.2.6" } });
  const dbClient = new MongoClient(mongo.getUri());
  await dbClient.connect();
  const database = dbClient.db("escala_test");
  let server, output = "";
  const root = "http://127.0.0.1:3102";
  let holdText, signalStarted, releaseCandidate;
  // Local Responses API protocol stub: tests the actual SDK adapter; not live AI.
  const mock = await startResponsesStub(0, async (candidate, input) => {
    if (input.buyerMessage === "I want a refund.") candidate.draft = "Your refund has been issued.";
    if (input.buyerMessage === "When will this arrive? risky proposal test") candidate.draft = "I'll refund you immediately.";
    if (input.buyerMessage === "Thank you! generation failure test") throw new Error("Test-only generator failure");
    if (input.buyerMessage === holdText) {
      signalStarted(); await new Promise(resolve => { releaseCandidate = resolve; });
    }
  });
  const baseURL = `http://127.0.0.1:${mock.address().port}/v1`;
  async function start(useMock = false, failTransport = false) {
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", "3102"], {
      cwd: process.cwd(), windowsHide: true,
      env: { ...process.env, MONGODB_URI: mongo.getUri(), MONGODB_DB: "escala_test", OPENAI_API_KEY: useMock ? "test-only-not-a-real-key" : "", OPENAI_BASE_URL: baseURL, ESCALA_ENABLE_EXTERNAL_SEND: "false", ESCALA_AUTONOMY_WORKER: "0", ESCALA_AUTONOMY_MODE: "ON", ESCALA_GENERATION_PROVIDER: "test_stub", ESCALA_SIMULATED_TRANSPORT_FAIL: failTransport ? "1" : "0" },
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
  const reply = async (id, body) => request(`/api/threads/${id}/replies`, {
    requestId: crypto.randomUUID(), mode: "seller", contextRevision: (await request(`/api/threads/${id}`)).data.thread.contextRevision,
    ...(body.sellerApproved ? { approvedText: body.text?.trim() } : {}), ...body });
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

    // Background jobs, real MongoDB transactions and the actual Responses SDK.
    // The stub is explicitly test-only; none of this represents live AI or delivery.
    await database.collection("processing_jobs").updateMany({}, { $set: { status: "DONE" } });
    const detail = async id => (await request(`/api/threads/${id}`)).data;
    const mode = async value => {
      const current = (await request("/api/autonomy")).data;
      const changed = await request("/api/autonomy", { mode: value, expectedVersion: current.settings.version });
      assert.equal(changed.status, 200, JSON.stringify(changed.data));
    };
    const inbound = async (id, text, eventId = crypto.randomUUID()) => {
      const result = await request(`/api/threads/${id}/messages`, { eventId, text, buyerName: id });
      assert.ok([200, 201].includes(result.status), JSON.stringify(result.data)); return result;
    };
    const worker = async (fail = false) => promisify(execFile)(process.execPath,
      ["--import", "tsx", "scripts/process-inbox.mts", "--once", "--limit", "100"], {
        windowsHide: true, env: { ...process.env, MONGODB_URI: mongo.getUri(), MONGODB_DB: "escala_test",
          OPENAI_API_KEY: "test-only-not-a-real-key", OPENAI_BASE_URL: baseURL, ESCALA_GENERATION_PROVIDER: "test_stub",
          ESCALA_AUTONOMY_WORKER: "0", ESCALA_SIMULATED_TRANSPORT_FAIL: fail ? "1" : "0" },
      });
    const fact = { evidenceId: "verified-test-stock", observedAt: new Date().toISOString(),
      validUntil: new Date(Date.now() + 3_600_000).toISOString(), productName: "Linen Shirt", size: "M", available: true };
    await t.test("verified size M is processed and sent without any UI generation request", async () => {
      await inbound("auto-stock", "Do you have this in size M?");
      assert.equal((await detail("auto-stock")).recommendation, null);
      await database.collection("threads").updateOne({ id: "auto-stock" }, { $set: { verifiedContext: { stock: fact } } });
      await worker();
      const record = await detail("auto-stock");
      assert.equal(record.thread.conversationState, "AUTO_HANDLED");
      assert.equal(record.recommendation.deliveryState, "AUTO_SEND");
      assert.equal(record.messages.at(-1).sentBy, "escala");
      assert.match(record.messages.at(-1).text, /Size M of Linen Shirt.*available/);
      assert.equal(record.deliveries[0].state, "SENT");
      assert.match(record.deliveries[0].providerMessageId, /^sim-/);
      assert.equal(record.audit.find(a => a.action === "reply_sent").reply.confidence, .96);
      assert.equal(record.recommendation.generationProvider, "test_stub");
    });
    await t.test("verified order tracking reports factual status automatically", async () => {
      await inbound("auto-tracking", "Where is my order?");
      await database.collection("threads").updateOne({ id: "auto-tracking" }, { $set: { verifiedContext: { tracking: {
        orderId: "4821", status: "In transit", evidenceId: "verified-tracking", observedAt: fact.observedAt, validUntil: fact.validUntil,
      } } } });
      await worker();
      const record = await detail("auto-tracking");
      assert.equal(record.thread.conversationState, "AUTO_HANDLED");
      assert.match(record.messages.at(-1).text, /#4821 shows: In transit/);
      assert.equal(record.order, null); // No inferred order mutation.
    });
    for (const [id, text] of [
      ["held-guarantee", "This is a birthday gift and must arrive before 5 PM tomorrow. Can you guarantee delivery?"],
      ["held-cancel", "Cancel my order."],
      ["held-payment", "I was charged twice. Refund the second payment."],
    ]) await t.test(`${id}: pre-generated reply held for exact seller approval`, async () => {
      await inbound(id, text); await worker(); const record = await detail(id);
      assert.equal(record.thread.conversationState, "APPROVAL_REQUIRED");
      assert.equal(record.recommendation.deliveryState, "APPROVAL_REQUIRED");
      assert.ok(record.recommendation.draft);
      assert.equal(record.messages.filter(m => m.role === "seller").length, 0);
      assert.ok(record.recommendation.reasons.length);
    });
    await t.test("low confidence ambiguous input has a prepared draft, never a sent message", async () => {
      await inbound("held-ambiguous", "Something happened, can you help?"); await worker();
      const record = await detail("held-ambiguous");
      assert.equal(record.recommendation.confidence, .4);
      assert.equal(record.recommendation.deliveryState, "REVIEW_REQUIRED");
      assert.ok(record.recommendation.draft);
      assert.equal(record.messages.length, 1);
    });
    await t.test("generated refund commitment is inspected and retained in audit, safe fallback held", async () => {
      await inbound("held-proposal", "When will this arrive? risky proposal test"); await worker();
      const record = await detail("held-proposal");
      assert.equal(record.recommendation.deliveryState, "APPROVAL_REQUIRED");
      assert.ok(record.audit.some(a => a.attemptedText === "I'll refund you immediately."));
      assert.notEqual(record.recommendation.draft, "I'll refund you immediately.");
      assert.equal(record.messages.length, 1);
    });
    await t.test("edited text and a new buyer revision cannot reuse an old approval", async () => {
      const record = await detail("held-cancel"), rec = record.recommendation;
      const wrong = await reply("held-cancel", { text: "I will refund you.", recommendationId: rec.id,
        sellerApproved: true, approvedText: rec.draft });
      assert.equal(wrong.data.error.code, "APPROVAL_REQUIRED");
      await inbound("held-cancel", "Actually, do not cancel it. I need tracking instead.");
      const stale = await reply("held-cancel", { text: rec.draft, recommendationId: rec.id, sellerApproved: true,
        approvedText: rec.draft, contextRevision: record.thread.contextRevision });
      assert.equal(stale.data.error.code, "STALE_CONTEXT");
      assert.equal((await detail("held-cancel")).messages.filter(m => m.role === "seller").length, 0);
    });
    await t.test("simulated transport failure persists, enters digest and retry sends exactly once", async () => {
      await inbound("auto-failed", "Do you have this in size M?");
      await database.collection("threads").updateOne({ id: "auto-failed" }, { $set: { verifiedContext: { stock: fact } } });
      await worker(true); const failed = await detail("auto-failed");
      assert.equal(failed.thread.conversationState, "SEND_FAILED");
      assert.equal(failed.deliveries[0].state, "FAILED");
      assert.equal(failed.messages.length, 1);
      assert.ok((await request("/api/autonomy")).data.brief.counts.failed >= 1);
      const attemptId = failed.deliveries[0].id;
      const first = await request("/api/threads/auto-failed/replies", { retryAttemptId: attemptId });
      assert.equal(first.status, 200, JSON.stringify(first.data));
      const second = await request("/api/threads/auto-failed/replies", { retryAttemptId: attemptId });
      assert.equal(second.data.message.id, first.data.message.id);
      assert.equal((await detail("auto-failed")).messages.filter(m => m.role === "seller").length, 1);
    });
    await t.test("duplicate and concurrent inbound events create one message and one processing job", async () => {
      const eventId = crypto.randomUUID();
      const results = await Promise.all([inbound("auto-duplicate", "Thank you!", eventId), inbound("auto-duplicate", "Thank you!", eventId)]);
      assert.ok(results.some(r => r.data.duplicate));
      await Promise.all([worker(), worker()]);
      assert.equal(await database.collection("messages").countDocuments({ inboundEventId: eventId }), 1);
      assert.equal(await database.collection("processing_jobs").countDocuments({ threadId: "auto-duplicate" }), 1);
      assert.equal((await detail("auto-duplicate")).messages.filter(m => m.role === "seller").length, 1);
    });
    await t.test("DRAFT_ONLY prepares an eligible candidate and backend blocks automatic delivery", async () => {
      await mode("DRAFT_ONLY"); await inbound("draft-only", "Thank you!"); await worker();
      const record = await detail("draft-only");
      assert.ok(record.recommendation.draft);
      assert.equal(record.recommendation.deliveryState, "AUTO_SEND");
      assert.equal(record.thread.conversationState, "WAITING_FOR_SELLER_REVIEW");
      assert.equal(record.messages.length, 1);
      const blocked = await reply("draft-only", { text: record.recommendation.draft, recommendationId: record.recommendation.id, mode: "automatic" });
      assert.equal(blocked.data.error.code, "AUTONOMY_DISABLED");
    });
    await t.test("PAUSED keeps inbound persisted and does not generate or send", async () => {
      await mode("PAUSED"); await inbound("paused", "Thank you!"); await worker();
      const record = await detail("paused");
      assert.equal(record.thread.conversationState, "AWAITING_PROCESSING");
      assert.equal((await database.collection("threads").findOne({ id: "paused" })).analysisVersion, "pending");
      assert.equal(record.recommendation, null); assert.equal(record.messages.length, 1);
      await mode("ON"); await worker();
      assert.equal((await detail("paused")).thread.conversationState, "AUTO_HANDLED");
    });
    await t.test("last-seen brief counts persisted facts, survives restart, and invents no order changes", async () => {
      const snapshot = (await request("/api/autonomy")).data;
      await request("/api/autonomy", { visitThrough: snapshot.brief.asOf });
      await inbound("brief-new", "Thank you!"); await worker();
      const current = (await request("/api/autonomy")).data;
      assert.equal(current.brief.since, snapshot.brief.asOf);
      assert.equal(current.brief.counts.incoming, 1);
      assert.equal(current.brief.counts.automaticReplies, 1);
      assert.deepEqual(current.brief.orderUpdates, []);
      await stop(); await start(true);
      const restored = (await request("/api/autonomy")).data;
      assert.deepEqual(restored.brief.counts, current.brief.counts);
      assert.equal(restored.brief.since, snapshot.brief.asOf);
    });
    await t.test("acknowledged brief with no new activity stays honest", async () => {
      const snapshot = (await request("/api/autonomy")).data;
      await request("/api/autonomy", { visitThrough: snapshot.brief.asOf });
      const quiet = (await request("/api/autonomy")).data.brief;
      assert.equal(quiet.counts.incoming, 0); assert.equal(quiet.counts.automaticReplies, 0);
      assert.equal(quiet.counts.resolved, 0); assert.equal(quiet.counts.failed, 0);
      assert.deepEqual(quiet.events, []); assert.deepEqual(quiet.orderUpdates, []);
    });
    await t.test("classifier failure and low classifier confidence hold otherwise eligible replies", async () => {
      for (const [id, sentiment] of [["classifier-failed", { label: "unknown", confidence: null, language: "english", source: "unavailable" }],
        ["classifier-low", { label: "neutral", confidence: .2, language: "english", source: "local_english_model" }]]) {
        await inbound(id, "Thank you!");
        await database.collection("threads").updateOne({ id }, { $set: { sentiment, analysisVersion: ANALYSIS_VERSION } });
        await worker(); const record = await detail(id);
        assert.equal(record.recommendation.deliveryState, "REVIEW_REQUIRED");
        assert.equal(record.messages.length, 1);
      }
    });
    await t.test("changed evidence invalidates pending automatic and seller approvals", async () => {
      await mode("DRAFT_ONLY"); await inbound("stale-evidence", "Do you have this in size M?");
      await database.collection("threads").updateOne({ id: "stale-evidence" }, { $set: { verifiedContext: { stock: fact } } });
      await worker(); const record = await detail("stale-evidence");
      await database.collection("threads").updateOne({ id: "stale-evidence" }, { $set: { "verifiedContext.stock.available": false } });
      const blocked = await reply("stale-evidence", { text: record.recommendation.draft, recommendationId: record.recommendation.id });
      assert.equal(blocked.data.error.code, "STALE_CONTEXT");
      await mode("ON"); await worker();
      assert.equal((await detail("stale-evidence")).messages.length, 1);
    });
    await t.test("explicit seller manual/escalated/resolved state survives mode changes and is never inferred from a reply", async () => {
      await mode("DRAFT_ONLY"); await inbound("seller-manual", "Thank you!"); await worker();
      const record = await detail("seller-manual");
      const update = await fetch(root + "/api/threads/seller-manual", { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: "ESCALATED", contextRevision: record.thread.contextRevision }) });
      assert.equal(update.status, 200);
      await mode("ON"); await worker();
      assert.equal((await detail("seller-manual")).thread.conversationState, "ESCALATED");
      const blocked = await reply("seller-manual", { text: record.recommendation.draft, recommendationId: record.recommendation.id, mode: "automatic" });
      assert.equal(blocked.data.error.code, "AUTO_SEND_BLOCKED");
      assert.equal((await detail("seller-manual")).messages.length, 1);
      const resolved = await fetch(root + "/api/threads/seller-manual", { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: "RESOLVED", contextRevision: record.thread.contextRevision }) });
      assert.equal(resolved.status, 200);
      assert.ok((await request("/api/autonomy")).data.brief.counts.resolved >= 1);
    });
    await t.test("generator failure prepares an honest fallback with no confidence and no send", async () => {
      await inbound("generation-failed", "Thank you! generation failure test"); await worker();
      const record = await detail("generation-failed");
      assert.equal(record.recommendation.confidence, null);
      assert.equal(record.recommendation.draftSource, "template");
      assert.equal(record.recommendation.deliveryState, "REVIEW_REQUIRED");
      assert.match(record.recommendation.modelNotice, /drafting failed/);
      assert.equal(record.messages.length, 1);
    });
    await t.test("expired trusted facts cannot authorize automatic information claims", async () => {
      await inbound("expired-stock", "Do you have this in size M?");
      await database.collection("threads").updateOne({ id: "expired-stock" }, { $set: { verifiedContext: {
        stock: { ...fact, validUntil: new Date(Date.now() - 1000).toISOString() } } } });
      await worker(); const record = await detail("expired-stock");
      assert.equal(record.recommendation.deliveryState, "REVIEW_REQUIRED");
      assert.doesNotMatch(record.recommendation.draft, /currently listed as available/);
      assert.equal(record.messages.length, 1);
    });
    for (const change of ["pause", "buyer"]) await t.test(`${change} during generation prevents stale candidate delivery`, async () => {
      const id = `race-${change}`;
      holdText = `Thank you! hold ${change} generation`;
      const started = new Promise(resolve => { signalStarted = resolve; });
      await inbound(id, holdText);
      const processing = worker();
      try {
        await started;
        if (change === "pause") await mode("PAUSED");
        else await inbound(id, "Cancel my order.");
      } finally { holdText = undefined; releaseCandidate?.(); }
      await processing;
      const record = await detail(id);
      assert.equal(record.messages.filter(m => m.role === "seller").length, 0);
      if (change === "pause") {
        assert.equal(record.recommendation, null);
        await mode("ON");
        await database.collection("processing_jobs").updateMany({ threadId: id }, { $set: { status: "HELD", manualHold: true } });
      } else {
        assert.equal(record.thread.conversationState, "APPROVAL_REQUIRED");
        assert.equal(record.recommendation.contextRevision, 1);
        assert.equal(await database.collection("recommendations").countDocuments({ threadId: id, contextRevision: 0 }), 0);
      }
    });
  } finally {
    await stop(); await dbClient.close(); await mongo.stop();
    await new Promise((resolve) => mock.close(resolve));
  }
});
