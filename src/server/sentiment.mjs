import path from "node:path";
import { readFile } from "node:fs/promises";
import { routeLanguage, vietnameseSentiment } from "./policy.mjs";

let modelPromise;
async function loadModel() {
  const directory = process.env.ESCALA_SENTIMENT_MODEL_PATH
    ? path.resolve(/* turbopackIgnore: true */ process.env.ESCALA_SENTIMENT_MODEL_PATH)
    : path.join(process.cwd(), "data", "models", "english");
  const config = JSON.parse(await readFile(path.join(directory, "config.json"), "utf8"));
  const metadata = JSON.parse(await readFile(path.join(directory, "export.json"), "utf8"));
  if (!/^[a-f0-9]{64}$/.test(metadata.source_weights_sha256)) throw new Error("Missing model provenance");
  if (JSON.stringify(Object.values(config.id2label)) !== JSON.stringify(["negative", "neutral", "positive"])) {
    throw new Error("Unexpected sentiment label mapping");
  }
  const { pipeline, env } = await import("@huggingface/transformers");
  env.allowRemoteModels = false;
  env.localModelPath = path.dirname(directory) + path.sep;
  const classifier = await pipeline("text-classification", path.basename(directory), {
    device: "cpu", dtype: "fp32", local_files_only: true,
  });
  return { classifier, modelId: `english-${metadata.source_weights_sha256.slice(0, 8)}` };
}

/** Local inference only. Recommendation confidence is a separate signal. */
export async function analyzeSentiment(text) {
  const language = routeLanguage(text);
  if (language !== "english") return {
    label: vietnameseSentiment(text), confidence: null,
    source: "vietnamese_rules", language,
    notice: "Rule signals have no calibrated confidence; Vietnamese sentiment is not a trained model.",
  };
  try {
    modelPromise ??= loadModel().catch((error) => { modelPromise = undefined; throw error; });
    const { classifier, modelId } = await modelPromise;
    const [result] = await classifier(text, { truncation: true, max_length: 128 });
    if (!["negative", "neutral", "positive"].includes(result.label) || !Number.isFinite(result.score)) throw new Error("Invalid sentiment result");
    return { label: result.label, confidence: Math.round(result.score * 1000) / 1000,
      source: "local_english_model", language, modelId };
  } catch {
    return { label: "unknown", confidence: null, source: "unavailable", language,
      notice: "Local English sentiment checkpoint unavailable; seller review required." };
  }
}
