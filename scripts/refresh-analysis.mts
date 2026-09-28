import { refreshThreadAnalyses } from "../src/server/repository.ts";
import { getClient } from "../src/server/mongodb.ts";

try {
  console.log(`Refreshed ${await refreshThreadAnalyses()} MongoDB thread analyses; original messages retained.`);
} finally {
  await (await getClient()).close();
}
