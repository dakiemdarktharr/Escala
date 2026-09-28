import test from "node:test";
import assert from "node:assert/strict";
import { detectIntent, replyTemplate, replyDeliveryDecision, hasUnverifiedActionClaim } from "../src/server/policy.mjs";

for (const [text, intent, risk] of [
  ["Hi, does this come in black?", "product_information", "low"],
  ["I ordered medium but got large.", "wrong_item", "low"],
  ["where is my fucking package", "order_status", "low"],
  ["Cancel my order.", "cancellation", "high"],
  ["I want a refund.", "refund", "high"],
  ["dit me may tra tien cho tao", "refund", "high"],
]) test(`reply workflow: ${text}`, () => {
  assert.equal(detectIntent(text), intent);
  const template = replyTemplate(text);
  assert.ok(template.draft.length > 20);
  assert.equal(hasUnverifiedActionClaim(template.draft), false);
  assert.doesNotMatch(template.recommendedStep, /escalate/i);
  const gate = replyDeliveryDecision({ text, draft: template.draft, confidence: null });
  assert.equal(gate.risk, risk);
  assert.equal(gate.deliveryState, risk === "high" ? "APPROVAL_REQUIRED" : "REVIEW_REQUIRED");
});
test("confidence, grounding and risk gate delivery independently", () => {
  const safe = { text: "Thank you!", draft: "Thank you for your feedback!", confidence: .96, automaticGrounded: true };
  assert.equal(replyDeliveryDecision(safe).deliveryState, "AUTO_SEND");
  for (const confidence of [null, .89, NaN, 1.1]) assert.equal(replyDeliveryDecision({ ...safe, confidence }).deliveryState, "REVIEW_REQUIRED");
  for (const threshold of [0, .89, NaN, 1.1]) assert.equal(replyDeliveryDecision({ ...safe, threshold }).deliveryState, "REVIEW_REQUIRED");
  assert.equal(replyDeliveryDecision({ ...safe, automaticGrounded: false }).deliveryState, "REVIEW_REQUIRED");
  const risk = replyDeliveryDecision({ ...safe, text: "Cancel my order.", confidence: .99 });
  assert.equal(risk.deliveryState, "APPROVAL_REQUIRED");
  assert.equal(replyDeliveryDecision({ ...safe, draft: null }).deliveryState, "MANUAL_ONLY");
});
test("edited response cannot introduce an autonomous commitment", () => {
  assert.equal(replyDeliveryDecision({ text: "Thank you", draft: "I will refund your payment", confidence: .99, automaticGrounded: true }).risk, "high");
  for (const text of ["Your refund has been issued.", "I cancelled your order.", "Your replacement is on the way.", "We will refund you.", "Shop đã hoàn tiền."]) assert.equal(hasUnverifiedActionClaim(text), true, text);
});
test("side-effect replacements require approval while product compatibility questions do not", () => {
  for (const text of ["Please replace my item", "Please resend it", "Ship a replacement"]) {
    assert.equal(replyDeliveryDecision({ text, draft: "Please share your order number.", confidence: .99, automaticGrounded: true }).deliveryState, "APPROVAL_REQUIRED");
  }
  assert.equal(replyDeliveryDecision({ text: "Do you sell a compatible replacement filter?", draft: "Which model is it for?", confidence: null }).risk, "low");
});
