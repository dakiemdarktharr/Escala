import test from "node:test";
import assert from "node:assert/strict";
import {
  APPROVED_AVAILABILITY_ANSWER,
  detectHardRisk,
  evaluateRecommendation,
} from "../src/server/policy.mjs";

const safeEvidence = [
  "kb-product-blue-linen-shirt-v1",
  "kb-shipping-standard-v1",
  "kb-approved-answer-availability-v1",
];
const safeInput = {
  text: "Hi, is the Blue Linen Shirt available in size M? How long does standard delivery take to Ho Chi Minh City?",
  scenario: "safe_faq",
  confidence: 0.96,
  missingInformation: [],
  evidenceIds: safeEvidence,
  threshold: 0.9,
  hasApprovedAnswer: true,
};

test("grounded routine FAQ passes only with approved answer and all required evidence", () => {
  assert.equal(evaluateRecommendation(safeInput).action, "AUTO_REPLY");
  assert.match(APPROVED_AVAILABILITY_ANSWER, /not a guarantee/);
});

test("high model confidence cannot auto-reply without complete grounding", () => {
  assert.equal(evaluateRecommendation({ ...safeInput, evidenceIds: safeEvidence.slice(0, 2) }).action, "DRAFT_FOR_SELLER");
  assert.equal(evaluateRecommendation({ ...safeInput, hasApprovedAnswer: false }).action, "DRAFT_FOR_SELLER");
  assert.equal(evaluateRecommendation({ ...safeInput, evidenceIds: [] }).action, "DRAFT_FOR_SELLER");
});

test("identified missing facts ask for clarification", () => {
  assert.equal(evaluateRecommendation({ ...safeInput, scenario: "ambiguous", missingInformation: ["order id"] }).action, "ASK_CLARIFICATION");
});

test("financial, legal, safety, identity, compensation, and side-effect risks require approval", () => {
  const riskyMessages = [
    "Please refund the duplicate payment",
    "I will take legal action and report you",
    "This product caused an allergic reaction",
    "My account was hacked; reset my password",
    "Give me a compensation discount",
    "Please cancel my order immediately",
  ];
  for (const text of riskyMessages) assert.equal(detectHardRisk(text).hard, true, text);
  assert.equal(evaluateRecommendation({ ...safeInput, text: riskyMessages[0] }).action, "DRAFT_FOR_SELLER");
});

test("only the reviewed safe FAQ can become automatic and confidence must meet threshold", () => {
  assert.equal(evaluateRecommendation({ ...safeInput, scenario: "unknown_faq" }).action, "DRAFT_FOR_SELLER");
  assert.equal(evaluateRecommendation({ ...safeInput, confidence: 0.89 }).action, "DRAFT_FOR_SELLER");
  assert.equal(evaluateRecommendation({ ...safeInput, scenario: "urgent_deadline" }).action, "DRAFT_FOR_SELLER");
});
