import { processPendingJobs } from "../src/server/autonomy.ts";
import { getClient } from "../src/server/mongodb.ts";

if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required");
const once = process.argv.includes("--once");
const limitFlag = process.argv.indexOf("--limit");
const limit = limitFlag < 0 ? 10 : Number(process.argv[limitFlag + 1]);
if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error("--limit must be 1–100");
do {
  console.log(JSON.stringify({ processed: await processPendingJobs(limit), at: new Date().toISOString() }));
  if (!once) await new Promise(resolve => setTimeout(resolve, 3000));
} while (!once);
await (await getClient()).close();
