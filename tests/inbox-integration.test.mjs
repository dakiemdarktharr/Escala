import test from "node:test";
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { once } from "node:events";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { MongoClient } from "mongodb";

const enabled = process.env.ESCALA_RUN_INTEGRATION === "1";
test("existing Escala routes persist triage, recommendations, and audit in MongoDB", { skip: !enabled, timeout: 180_000 }, async () => {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: "8.2.6" } });
  const dbClient = new MongoClient(mongo.getUri());
  await dbClient.connect();
  const database = dbClient.db("escala_test");
  let server;
  let output = "";
  const root = "http://127.0.0.1:3100";
  async function start() {
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", "3100"], {
      cwd: process.cwd(), windowsHide: true,
      env: { ...process.env, MONGODB_URI: mongo.getUri(), MONGODB_DB: "escala_test", OPENAI_API_KEY: "", ESCALA_ENABLE_EXTERNAL_SEND: "false" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    server.stdout.on("data", (data) => { output += data; });
    server.stderr.on("data", (data) => { output += data; });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null) throw new Error("Next server exited: " + output);
      try { if ((await fetch(root)).ok) return; } catch { /* startup */ }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error("Next server startup timed out: " + output);
  }
  async function stop() {
    if (server && server.exitCode === null) { const exited = once(server, "exit"); server.kill(); await exited; }
  }
  async function request(path, body) {
    const response = await fetch(root + path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {});
    return { status: response.status, data: await response.json() };
  }
  try {
    await start();
    const health = await request("/api/health");
    assert.equal(health.data.services.database, "connected");
    const inbox = await request("/api/inbox");
    assert.equal(inbox.status, 200);
    assert.equal(inbox.data.threads.length, 11);
    assert.deepEqual(inbox.data.threads.map((row) => row.priorityScore), inbox.data.threads.map((row) => row.priorityScore).sort((a, b) => b - a));
    const hostile = await request("/api/threads/thread-vn-hostile-001");
    assert.equal(hostile.data.messages[0].text, "dit me may tra tien cho tao");
    assert.equal(hostile.data.thread.sentiment.source, "vietnamese_rules");
    assert.equal(hostile.data.thread.sentiment.label, "negative");
    assert.equal(hostile.data.thread.intent, "refund");
    assert.equal(hostile.data.thread.urgency, "low");
    assert.equal(hostile.data.thread.priorityScore, 85);
    const demand = await request("/api/threads/thread-vn-demand-001");
    assert.equal(demand.data.thread.sentiment.label, "neutral");
    assert.equal(demand.data.thread.priorityScore, 70);
    const factual = await request("/api/threads/thread-vn-factual-001");
    assert.equal(factual.data.thread.sentiment.label, "neutral");
    const positive = await request("/api/threads/thread-vn-positive-001");
    assert.equal(positive.data.thread.sentiment.label, "positive");
    assert.equal(positive.data.thread.requiresAction, false);
    const recommendation = await request("/api/threads/thread-vn-hostile-001/recommendations", {});
    assert.equal(recommendation.status, 201);
    assert.equal(recommendation.data.recommendation.action, "ESCALATE");
    assert.equal(recommendation.data.recommendation.risk, "high");
    const id = recommendation.data.recommendation.id;
    assert.equal((await request(`/api/recommendations/${id}/decision`, { decision: "edit", editedDraft: "Refund approved" })).status, 409);
    const decision = await request(`/api/recommendations/${id}/decision`, { decision: "escalate", note: "Verify order and payment; handle abusive demand carefully." });
    assert.equal(decision.status, 200);
    assert.equal(await database.collection("recommendations").countDocuments({ id }), 1);
    assert.equal(await database.collection("audit").countDocuments({ threadId: "thread-vn-hostile-001" }), 2);
    const saved = await database.collection("threads").findOne({ id: "thread-vn-hostile-001" });
    assert.equal(saved.preview, "dit me may tra tien cho tao");
    const analyzedAt = saved.analyzedAt;
    await request("/api/inbox");
    assert.equal((await database.collection("threads").findOne({ id: saved.id })).analyzedAt, analyzedAt);
    const refreshed = await promisify(execFile)(process.execPath, ["--import", "tsx", "scripts/refresh-analysis.mts"], {
      env: { ...process.env, MONGODB_URI: mongo.getUri(), MONGODB_DB: "escala_test" }, windowsHide: true,
    });
    assert.match(refreshed.stdout, /Refreshed 11/);
    const migrated = await database.collection("threads").findOne({ id: saved.id });
    assert.equal(migrated.preview, saved.preview);
    assert.equal(migrated.unread, saved.unread);
    assert.equal(await database.collection("audit").countDocuments({ threadId: saved.id }), 2);
    await stop();
    await start();
    const restored = await request("/api/threads/thread-vn-hostile-001");
    assert.equal(restored.data.recommendation.id, id);
    assert.equal(restored.data.audit.length, 2);
    assert.equal(await database.collection("threads").countDocuments(), 11);
  } finally {
    await stop();
    await dbClient.close();
    await mongo.stop();
  }
});
