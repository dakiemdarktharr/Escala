import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { analyzeSentiment } from "../src/server/sentiment.mjs";
import { analyzeTriage, detectHardRisk, evaluateRecommendation, routeLanguage } from "../src/server/policy.mjs";

const receivedAt = "2026-09-28T00:00:00Z";
const now = new Date(receivedAt);
for (const [text, language, label, intent, priority] of [
  ["dit me may tra tien cho tao", "vietnamese", "negative", "refund", 85],
  ["trả tiền cho tao", "vietnamese", "neutral", "refund", 70],
  ["địt mẹ mày trả tiền cho tao", "vietnamese", "negative", "refund", 85],
  ["dm may tra tien cho t", "vietnamese", "negative", "refund", 85],
  ["Mình muốn được hoàn tiền cho đơn này ạ", "vietnamese", "neutral", "refund", 45],
  ["shop ơi em đặt màu kem mà sao nhận màu đen vậy ạ", "vietnamese", "neutral", "wrong_item", 47],
  ["cảm ơn shop nha hàng đẹp lắm", "vietnamese", "positive", "positive_feedback", 5],
  ["Shop refund cho minh, giao nham mau roi", "mixed", "neutral", "wrong_item", 47],
]) test(`triage: ${text}`, async () => {
  const sentiment = await analyzeSentiment(text);
  assert.equal(routeLanguage(text), language);
  assert.equal(sentiment.label, label);
  assert.equal(sentiment.source, "vietnamese_rules");
  assert.equal(sentiment.confidence, null);
  const result = analyzeTriage(text, sentiment, receivedAt, now);
  assert.equal(result.intent, intent);
  assert.equal(result.urgency, "low");
  assert.equal(result.priorityScore, priority);
  assert.equal(result.requiresAction, intent !== "positive_feedback");
  if (intent === "refund") assert.equal(detectHardRisk(text).hard, true);
});
test("temporal urgency, sentiment, risk, and waiting priority stay separate", async () => {
  const text = "Mình muốn hoàn tiền ngày mai ạ";
  const result = analyzeTriage(text, await analyzeSentiment(text), receivedAt, now);
  assert.equal(result.sentiment.label, "neutral");
  assert.equal(result.urgency, "high");
  assert.equal(detectHardRisk(text).hard, true);
  const aged = analyzeTriage("trả tiền cho tao", await analyzeSentiment("trả tiền cho tao"), receivedAt, new Date("2026-09-29T00:00:00Z"));
  assert.equal(aged.urgency, "low");
  assert.equal(aged.priorityScore, 80);
});
test("invalid confidence thresholds never grant automation; tone alone is not risk", () => {
  const input = { text: "Is size M available?", scenario: "safe_faq", confidence: .99,
    evidenceIds: ["kb-product-blue-linen-shirt-v1", "kb-shipping-standard-v1", "kb-approved-answer-availability-v1"], hasApprovedAnswer: true };
  for (const threshold of [NaN, -.1, 0, .89, 1.1]) assert.notEqual(evaluateRecommendation({ ...input, threshold }).action, "AUTO_REPLY");
  assert.equal(evaluateRecommendation({ ...input, sentiment: { label: "unknown" } }).action, "AUTO_REPLY");
  assert.equal(detectHardRisk("tranquility matters").hard, false);
});
test("missing English assets return explicit unavailable sentiment", () => {
  const code = "import {analyzeSentiment} from './src/server/sentiment.mjs'; console.log(JSON.stringify(await analyzeSentiment('Please refund my order.')));";
  const result = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", code], {
    env: { ...process.env, ESCALA_SENTIMENT_MODEL_PATH: ".local/missing-model" }, encoding: "utf8", windowsHide: true,
  }));
  assert.equal(result.label, "unknown");
  assert.equal(result.source, "unavailable");
  assert.equal(result.confidence, null);
});
test("real exported English model uses the original labels", { skip: !existsSync("data/models/english/onnx/model.onnx") }, async () => {
  for (const [text, label] of [
    ["I ordered the medium and got the large.", "neutral"],
    ["This is unacceptable. I'm frustrated with your service.", "negative"],
    ["Great, another broken bottle. Exactly what I wanted.", "negative"],
    ["Love the quality, thank you!", "positive"],
  ]) {
    const result = await analyzeSentiment(text);
    assert.equal(result.language, "english");
    assert.equal(result.source, "local_english_model", result.notice);
    assert.equal(result.label, label, text);
    assert.ok(result.confidence > 0 && result.confidence <= 1);
  }
  const parity = JSON.parse(readFileSync("data/sentiment/results/export_parity.json", "utf8"));
  assert.equal(parity.cases.length, 75);
  for (const item of parity.cases) {
    const result = await analyzeSentiment(item.text);
    assert.equal(result.label, item.label, item.row_id);
    assert.ok(Math.abs(result.confidence - item.confidence) < .001, item.row_id);
  }
});
