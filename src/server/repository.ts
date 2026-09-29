import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Collection } from "mongodb";
import { analyzeSentiment } from "./sentiment.mjs";
import { ANALYSIS_VERSION, analyzeTriage } from "./policy.mjs";
import {
  getAuditCollection,
  getKnowledgeBaseCollection,
  getRecommendationsCollection,
  getThreadsCollection,
  getMessagesCollection,
  getJobsCollection, getSettingsCollection, getDeliveriesCollection,
} from "./mongodb";
import type { KnowledgeBaseRecord, SyntheticThreadRecord } from "./mongodb";

export interface DemoMessageFixture {
  id: string;
  threadId: string;
  scenario: string;
  receivedAt: string;
  channel: string;
  customerLabel: string;
  text: string;
  expectedIntent: string | null;
  expectedAction: string;
  expectedUrgency: string;
  expectedUrgencyReasons: string[];
}

let messageFixturesPromise: Promise<DemoMessageFixture[]> | null = null;

export function getDemoMessages(): Promise<DemoMessageFixture[]> {
  if (!messageFixturesPromise) {
    const root = process.cwd();
    messageFixturesPromise = readFile(
      path.join(root, "data", "demo", "messages.json"),
      "utf8",
    )
      .then((raw) => JSON.parse(raw) as DemoMessageFixture[])
      .catch((error: unknown) => {
        messageFixturesPromise = null;
        throw error;
      });
  }
  return messageFixturesPromise;
}

async function toThread(fixture: DemoMessageFixture): Promise<SyntheticThreadRecord> {
  const sentiment = await analyzeSentiment(fixture.text);
  return {
    id: fixture.threadId,
    buyerName: fixture.customerLabel,
    preview: fixture.text,
    updatedAt: fixture.receivedAt,
    unread: true,
    ...analyzeTriage(fixture.text, sentiment, fixture.receivedAt),
    analysisVersion: ANALYSIS_VERSION,
    analyzedAt: new Date().toISOString(),
    scenario: fixture.scenario,
    channel: fixture.channel,
    contextRevision: 0, currentBuyerMessageId: fixture.id,
    conversationState: "AWAITING_PROCESSING", stateReasons: ["Awaiting background processing"],
  };
}

/** Idempotently upsert records keyed by their unique `id` field. */
async function upsertById<T extends { id: string }>(
  collection: Collection<T>,
  records: T[],
): Promise<number> {
  if (records.length === 0) {
    return 0;
  }

  await collection.createIndex({ id: 1 }, { unique: true });

  await collection.bulkWrite(
    records.map((record) => ({
      updateOne: {
        filter: { id: record.id } as never,
        update: { $setOnInsert: record },
        upsert: true,
      },
    })),
  );

  return records.length;
}

/**
 * Seed the demo data into MongoDB. Idempotent: re-runs upsert by `_id` and
 * never overwrite an existing record or log its contents.
 */
export async function seedDatabase(): Promise<{ threads: number; knowledgeBase: number }> {
  const root = process.cwd();

  const [messages, knowledgeRaw] = await Promise.all([
    getDemoMessages(),
    readFile(path.join(root, "data", "demo", "knowledge-base.json"), "utf8"),
  ]);

  const knowledgeBase = JSON.parse(knowledgeRaw) as KnowledgeBaseRecord[];
  const messageCollection = await getMessagesCollection();
  await upsertById(messageCollection, messages.map((message) => ({
    id: message.id, threadId: message.threadId, role: "buyer" as const,
    text: message.text, createdAt: message.receivedAt, sequence: 0,
  })));
  await messageCollection.createIndex({ threadId: 1, createdAt: 1 });
  await messageCollection.createIndex({ threadId: 1, requestId: 1 }, {
    unique: true, partialFilterExpression: { requestId: { $type: "string" } },
  });
  await messageCollection.createIndex({ inboundEventId: 1 }, { unique: true, partialFilterExpression: { inboundEventId: { $type: "string" } } });

  const collection = await getThreadsCollection();
  const existingIds = new Set((await collection.find({}, { projection: { id: 1 } }).toArray()).map((thread) => thread.id));
  const threads: SyntheticThreadRecord[] = [];
  // Sequential CPU inference avoids loading a second model or oversubscribing memory.
  for (const message of messages) if (!existingIds.has(message.threadId)) threads.push(await toThread(message));

  const [threadsCount, knowledgeCount] = await Promise.all([
    upsertById(collection, threads),
    upsertById(await getKnowledgeBaseCollection(), knowledgeBase),
  ]);

  const now = new Date().toISOString();
  const jobs = await getJobsCollection();
  await jobs.createIndex({ id: 1 }, { unique: true });
  await jobs.createIndex({ threadId: 1, contextRevision: 1 }, { unique: true });
  await jobs.createIndex({ status: 1, leaseUntil: 1 });
  await (await getDeliveriesCollection()).createIndex({ threadId: 1, requestId: 1 }, { unique: true });
  await (await getSettingsCollection()).createIndex({ id: 1 }, { unique: true });
  const configuredMode = process.env.ESCALA_AUTONOMY_MODE;
  await (await getSettingsCollection()).updateOne({ id: "workspace" }, { $setOnInsert: {
    id: "workspace", mode: configuredMode === "ON" || configuredMode === "PAUSED" ? configuredMode : "DRAFT_ONLY",
    version: 1, updatedAt: now, operationFence: 0,
  } }, { upsert: true });
  // Backfill only absent autonomy metadata. Existing replies and triage stay intact.
  for (const message of messages) {
    const record = await collection.findOne({ id: message.threadId });
    if (!record) continue;
    const answered = await messageCollection.findOne({ threadId: message.threadId, role: "seller" });
    if (record.contextRevision === undefined) await collection.updateOne({ id: record.id, contextRevision: { $exists: false } }, { $set: {
      contextRevision: 0, currentBuyerMessageId: message.id,
      conversationState: answered ? "WAITING_FOR_BUYER" : "AWAITING_PROCESSING",
      stateReasons: [answered ? "Existing seller reply retained" : "Awaiting background processing"],
    } });
    const revision = record.contextRevision ?? 0;
    const buyerMessageId = record.currentBuyerMessageId ?? message.id;
    await jobs.updateOne({ threadId: record.id, contextRevision: revision }, { $setOnInsert: {
      id: `job-${buyerMessageId}`, threadId: record.id, buyerMessageId, contextRevision: revision,
      status: answered ? "DONE" : "QUEUED", attempts: 0, createdAt: now, updatedAt: now,
    } }, { upsert: true });
    // Record seed ingestion only for genuinely new fixture threads, not migration history.
    if (threads.some((thread) => thread.id === record.id)) await (await getAuditCollection()).updateOne({ id: `inbound-${buyerMessageId}` }, { $setOnInsert: {
      id: `inbound-${buyerMessageId}`, threadId: record.id, type: "inbound", actor: "system", action: "buyer_message_received",
      reasonCodes: ["Synthetic seed message received; no marketplace connection"], evidenceIds: [], createdAt: now,
      contextRevision: revision, buyerMessageId,
    } }, { upsert: true });
  }

  return { threads: threadsCount, knowledgeBase: knowledgeCount };
}

/** Explicit migration: recompute cached analysis, retaining message and seller state. */
export async function refreshThreadAnalyses(): Promise<number> {
  const collection = await getThreadsCollection();
  const threads = await collection.find({}).toArray();
  let refreshed = 0;
  for (const thread of threads) {
    const sentiment = await analyzeSentiment(thread.preview);
    const result = await collection.updateOne({ id: thread.id, preview: thread.preview, contextRevision: thread.contextRevision }, { $set: {
      ...analyzeTriage(thread.preview, sentiment, thread.updatedAt),
      analysisVersion: ANALYSIS_VERSION, analyzedAt: new Date().toISOString(),
    } });
    refreshed += result.matchedCount;
  }
  return refreshed;
}

export {
  getAuditCollection,
  getKnowledgeBaseCollection,
  getRecommendationsCollection,
  getThreadsCollection,
};
