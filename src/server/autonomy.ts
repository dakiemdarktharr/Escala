import { randomUUID } from "node:crypto";
import { initialize, analyzeCurrentBuyer, createRecommendation, sendReply, ServiceError } from "./inbox-service";
import { getJobsCollection, getSettingsCollection, getThreadsCollection, getRecommendationsCollection, getAuditCollection } from "./mongodb";

/** Durable jobs live in the existing MongoDB workspace, independent of UI reads. */
export async function processPendingJobs(limit = 10): Promise<number> {
  await initialize();
  const jobs = await getJobsCollection();
  let processed = 0;
  for (let index = 0; index < limit; index++) {
    const settings = await (await getSettingsCollection()).findOne({ id: "workspace" });
    if (!settings || settings.mode === "PAUSED") break;
    const now = new Date().toISOString(), owner = randomUUID();
    const job = await jobs.findOneAndUpdate({ $or: [{ status: "QUEUED" }, { status: "PROCESSING", leaseUntil: { $lt: now } }] },
      { $set: { status: "PROCESSING", leaseOwner: owner, leaseUntil: new Date(Date.now() + 300_000).toISOString(), updatedAt: now },
        $inc: { attempts: 1 } }, { sort: { createdAt: 1 }, returnDocument: "after" });
    if (!job) break;
    const finish = async (status: typeof job.status, error?: string, recommendationId?: string) => {
      await jobs.updateOne({ id: job.id, leaseOwner: owner, status: "PROCESSING" }, { $set: { status, updatedAt: new Date().toISOString(),
        ...(error ? { error } : {}), ...(recommendationId ? { recommendationId } : {}) }, $unset: { leaseOwner: "", leaseUntil: "" } });
    };
    try {
      const thread = await (await getThreadsCollection()).findOne({ id: job.threadId });
      if (!thread || thread.contextRevision !== job.contextRevision || thread.currentBuyerMessageId !== job.buyerMessageId) {
        await finish("SUPERSEDED"); continue;
      }
      if (["RESOLVED", "ESCALATED", "WAITING_FOR_BUYER", "AUTO_HANDLED"].includes(thread.conversationState ?? "")) {
        await finish("DONE"); continue;
      }
      await analyzeCurrentBuyer(job.threadId, job.contextRevision, settings.version);
      const existing = await (await getRecommendationsCollection()).find({ threadId: job.threadId, contextRevision: job.contextRevision })
        .sort({ createdAt: -1, _id: -1 }).limit(1).next();
      if (existing?.status === "declined") { await finish("HELD"); continue; }
      const recommendation = existing ?? (await createRecommendation(job.threadId, job.contextRevision, settings.version)).recommendation;
      if (recommendation.status === "sent") { await finish("DONE"); continue; }
      const currentSettings = await (await getSettingsCollection()).findOne({ id: "workspace" });
      if (currentSettings?.mode === "ON" && recommendation.deliveryState === "AUTO_SEND" && recommendation.draft) {
        await sendReply(job.threadId, { requestId: `auto-${job.buyerMessageId}`, text: recommendation.draft,
          contextRevision: job.contextRevision, recommendationId: recommendation.id, mode: "automatic" });
        await finish("DONE", undefined, recommendation.id);
      } else {
        if (currentSettings?.mode === "DRAFT_ONLY" && recommendation.status === "pending")
          await (await getThreadsCollection()).updateOne({ id: job.threadId, contextRevision: job.contextRevision,
            autonomyDecision: { $ne: "MANUAL_ONLY" }, conversationState: { $nin: ["RESOLVED", "ESCALATED", "WAITING_FOR_BUYER", "AUTO_HANDLED"] } }, {
            $set: { stateReasons: ["Draft only mode: no automatic sending", ...recommendation.reasons] },
          });
        await finish("HELD", undefined, recommendation.id);
      }
      processed++;
    } catch (error) {
      if (error instanceof ServiceError && error.code === "STALE_CONTEXT") { await finish("SUPERSEDED"); continue; }
      if (error instanceof ServiceError && error.code === "AUTONOMY_DISABLED") {
        await finish("QUEUED"); break;
      }
      await finish("FAILED", error instanceof ServiceError ? error.code : "PROCESSING_FAILED");
      const stamp = new Date().toISOString();
      await (await getThreadsCollection()).updateOne({ id: job.threadId, contextRevision: job.contextRevision,
        conversationState: { $nin: ["AUTO_HANDLED", "WAITING_FOR_BUYER", "RESOLVED", "ESCALATED", "SEND_FAILED"] } },
      { $set: { conversationState: "WAITING_FOR_SELLER_REVIEW", autonomyDecision: "MANUAL_ONLY",
        stateReasons: ["Automatic processing could not complete; seller review required"] } });
      await (await getAuditCollection()).insertOne({ id: randomUUID(), threadId: job.threadId, type: "autonomy", actor: "system",
        action: "processing_failed", contextRevision: job.contextRevision, buyerMessageId: job.buyerMessageId,
        policyVersion: "escala-policy-4.0", reasonCodes: ["Automatic processing failed closed; no automatic reply recorded"], evidenceIds: [], createdAt: stamp });
      processed++;
    }
  }
  return processed;
}

let running = false;
let timer: ReturnType<typeof setInterval> | undefined;
export function startAutonomyWorker(): void {
  if (timer || process.env.ESCALA_AUTONOMY_WORKER === "0" || !process.env.MONGODB_URI) return;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await processPendingJobs(); }
    catch { console.warn("Escala background processing unavailable; will retry next tick"); }
    finally { running = false; }
  };
  timer = setInterval(() => void tick(), 3000);
  timer.unref();
  void tick();
}
