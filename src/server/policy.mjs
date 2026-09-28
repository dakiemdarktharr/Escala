const HARD_RISK_PATTERNS = [
  ["financial impact requires seller review", /\b(refund|refunds|refunded|charged|charge|payment|money|duplicate charge|double charged|reimburse|billing|paid twice)\b|hoàn tiền|bị trừ tiền|thanh toán|tính tiền|thu tiền/i],
  ["order changes are not performed by Escala", /\b(cancel|cancellation|change my order|modify my order|order status|change address|change quantity)\b|hủy đơn|huỷ đơn|đổi đơn|đổi địa chỉ/i],
  ["delivery commitments need verified carrier information", /\b(guarantee|must arrive|deadline|before \d|by today|by tomorrow|promise delivery|arrive by)\b|cam kết giao|phải giao trước|giao đúng ngày/i],
  ["complaint or reputation risk requires seller review", /\b(post .*public|publicly|social media|complaint|report you|lawsuit|legal action|regulator|regulatory)\b|đăng công khai|bóc phốt|khiếu nại|kiện|cơ quan chức năng/i],
  ["safety or health concerns require seller review", /\b(injur|injured|injury|unsafe|safety|allergy|allergic|poison|hazard|medical|health issue)\b|dị ứng|chấn thương|bị thương|không an toàn|sức khỏe|ngộ độc/i],
  ["account, identity, or security issues require seller review", /\b(account hacked|password|credential|identity|stolen account|unauthorized access|security breach|personal data)\b|mật khẩu|tài khoản bị hack|đánh cắp tài khoản|dữ liệu cá nhân/i],
  ["exceptional discounts or compensation require seller review", /\b(discount|coupon|compensation|compensate|free replacement|store credit|waive the fee)\b|giảm giá|mã giảm|bồi thường|đền bù/i],
  ["requested external actions need seller approval", /\b(send|issue|apply|dispatch|ship it|change|delete|publish)\b.{0,35}\b(now|immediately|for me|my order|the refund|a discount|a replacement)\b|gửi ngay|thực hiện giúp|xóa đơn/i],
];

const REQUIRED_SAFE_EVIDENCE = [
  "kb-product-blue-linen-shirt-v1",
  "kb-shipping-standard-v1",
  "kb-approved-answer-availability-v1",
];

export function detectHardRisk(text, scenario = "") {
  const normalized = normalizeText(text);
  const reasons = HARD_RISK_PATTERNS
    .filter(([, pattern]) => pattern.test(text))
    .map(([reason]) => reason);
  if (/\b(hoan tien|tra tien|thanh toan|tru tien|chuyen khoan)\b/.test(normalized)) reasons.push("financial impact requires seller review");
  if (/\b(huy don|doi dia chi)\b/.test(normalized)) reasons.push("order changes are not performed by Escala");
  if (/\b(boc phot|khieu nai|lua dao)\b/.test(normalized)) reasons.push("complaint or reputation risk requires seller review");
  if (["high_risk_payment", "urgent_deadline", "complaint_escalation"].includes(scenario) && reasons.length === 0) {
    reasons.push("fixture is classified for human review");
  }
  return { hard: reasons.length > 0, reasons: [...new Set(reasons)] };
}

export function evaluateRecommendation({
  text,
  scenario,
  confidence,
  missingInformation = [],
  evidenceIds = [],
  threshold = 0.9,
  hasApprovedAnswer = false,
  sentiment,
}) {
  const risk = detectHardRisk(text, scenario);
  if (risk.hard) return { action: "ESCALATE", reasons: risk.reasons };
  if (scenario === "missing_evidence" || evidenceIds.length === 0) {
    return { action: "ESCALATE", reasons: ["no verified evidence was retrieved"] };
  }
  if (missingInformation.length > 0) {
    return { action: "ASK_CLARIFICATION", reasons: ["model identified missing information"] };
  }
  if (sentiment && (sentiment.label === "negative" || sentiment.label === "unknown")) {
    return { action: "DRAFT_FOR_SELLER", reasons: ["tone needs human review; sentiment cannot authorize automatic action"] };
  }
  const cited = new Set(evidenceIds);
  const fullyGrounded = REQUIRED_SAFE_EVIDENCE.every((id) => cited.has(id)) && hasApprovedAnswer;
  const routineQuestion = scenario === "safe_faq" && /\b(available|availability|size|standard delivery|how long)\b/i.test(text);
  if (!fullyGrounded) {
    return { action: "DRAFT_FOR_SELLER", reasons: ["evidence did not pass the approved-answer grounding check"] };
  }
  if (!routineQuestion) {
    return { action: "DRAFT_FOR_SELLER", reasons: ["only the reviewed routine FAQ is eligible for automatic reply"] };
  }
  if (!Number.isFinite(threshold) || threshold < 0.9 || threshold > 1 || !Number.isFinite(confidence) || confidence < threshold || confidence > 1) {
    return { action: "DRAFT_FOR_SELLER", reasons: ["seller confirmation required because confidence is below threshold"] };
  }
  return { action: "AUTO_REPLY", reasons: ["reviewed routine FAQ, approved answer, complete evidence, and confidence threshold passed"] };
}

export const APPROVED_AVAILABILITY_ANSWER =
  "Size M is currently listed as available. Standard delivery to Ho Chi Minh City is normally estimated at 2–4 business days after dispatch. This is an estimate, not a guarantee.";

// Detection normalization never replaces the persisted buyer message.
export function normalizeText(text) {
  return text.normalize("NFKC").toLowerCase().replaceAll("đ", "d")
    .normalize("NFD").replace(/\p{M}/gu, "").match(/[a-z0-9]+/g)?.join(" ") ?? "";
}
const phrase = (text, cue) => ` ${text} `.includes(` ${normalizeText(cue)} `);
const VI_PHRASES = ["tra tien", "hoan tien", "cho tao", "dit me", "shop oi", "cam on", "cho minh", "cho em", "giao nham", "don hang", "chua toi", "khong thay", "doi size", "doi mau", "tra hang", "bao nhieu"];
const VI_TOKENS = new Set("tao may minh em anh chi nha nhe roi duoc khong ko k don hang mau tien giao doi tra cho oi muon ck khum hok hong dm dmm clm".split(" "));
const EN_MIXED = new Set("refund order wrong item please delivery damaged payment exchange".split(" "));
export function routeLanguage(text) {
  const normalized = normalizeText(text), tokens = new Set(normalized.split(" "));
  const hits = [...tokens].filter((token) => VI_TOKENS.has(token)).length;
  const accents = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(text);
  if (!VI_PHRASES.some((cue) => phrase(normalized, cue)) && hits < 3 && !(accents && hits >= 1)) return "english";
  return [...tokens].some((token) => EN_MIXED.has(token)) ? "mixed" : "vietnamese";
}
const ABUSE = ["dit me", "dit ma", "dm may", "dmm", "dm", "clm", "do ngu", "may ngu"];
const NEGATIVE = ["that vong", "khong hai long", "buc minh", "uc che", "te qua", "qua te", "qua chan", "lua dao", "khong chap nhan duoc", "rat kho chiu", "tuc qua", "lam an chan", "vo trach nhiem"];
const POSITIVE = ["cam on", "hang dep", "ung y", "rat thich", "tuyet voi", "qua dep", "tot lam", "hai long"];
export function vietnameseSentiment(text) {
  const normalized = normalizeText(text);
  if ([...ABUSE, ...NEGATIVE].some((cue) => phrase(normalized, cue))) return "negative";
  if (POSITIVE.some((cue) => phrase(normalized, cue))) return "positive";
  return "neutral";
}
export function detectIntent(text) {
  const normalized = normalizeText(text);
  const patterns = [
    ["wrong_item", ["giao nham", "gui nham", "nhan nham", "sai mau", "sai size", "dat mau", "wrong item", "wrong color", "wrong size", "ordered the", "got black instead"]],
    ["damaged_item", ["bi vo", "bi be", "bi hong", "rach", "mop", "damaged", "broken", "cracked"]],
    ["missing_item", ["thieu hang", "thieu mon", "chua nhan duoc hang", "missing item", "missing package", "parcel is missing"]],
    ["payment_dispute_and_refund", ["thanh toan loi", "chuyen khoan roi", "tru tien", "charged twice", "payment failed", "card declined"]],
    ["cancellation", ["huy don", "cancel", "cancellation", "dont ship"]],
    ["refund", ["hoan tien", "refund", "tra lai tien", "tra tien"]],
    ["return_or_exchange", ["doi hang", "doi size", "doi mau", "tra hang", "exchange", "return item"]],
    ["delivery_complaint", ["chua toi", "chua thay toi", "late delivery", "still not here", "not arrived"]],
    ["order_status", ["don toi dau", "kiem tra don", "where is my order", "tracking number"]],
    ["positive_feedback", ["cam on", "hang dep", "ung y", "thank you", "thanks", "love it", "great product"]],
    ["stock_check", ["con hang", "con size", "con ko", "con khong", "in stock", "available"]],
    ["shipping_faq", ["ship", "phi van chuyen", "giao hang", "delivery", "shipping"]],
    ["product_information", ["size nao", "tu van size", "chat lieu", "what size", "material", "washable"]],
    ["complaint", ["that vong", "khong hai long", "te qua", "disappointed", "terrible", "complaint"]],
  ];
  if (phrase(normalized, "available") && phrase(normalized, "standard delivery")) return "product_and_shipping_faq";
  return patterns.find(([, cues]) => cues.some((cue) => phrase(normalized, cue)))?.[0] ?? "unknown";
}
export const ANALYSIS_VERSION = "escala-triage-2";
export function analyzeTriage(text, sentiment, receivedAt, now = new Date()) {
  const normalized = normalizeText(text), intent = detectIntent(text);
  const abuse = sentiment.language !== "english" && ABUSE.some((cue) => phrase(normalized, cue));
  const demand = /\b(?:tra tien|refund) cho (?:tao|t)\b/.test(normalized);
  const priorityFlag = abuse ? "abusive_language" : demand ? "direct_money_demand" : null;
  const requiresAction = !(intent === "positive_feedback" && sentiment.label === "positive");
  const deadline = ["today", "tonight", "tomorrow", "immediately", "urgent", "asap", "hom nay", "toi nay", "ngay mai", "mai", "gap", "truoc le"].some((cue) => phrase(normalized, cue));
  const soon = ["soon", "som", "within a day", "still no reply"].some((cue) => phrase(normalized, cue));
  const urgency = deadline ? "high" : soon ? "medium" : "low";
  const urgencyReasons = deadline ? ["Explicit time pressure or deadline in the message"] : soon ? ["Buyer requests a response soon"] : ["No explicit temporal deadline detected"];
  const bonuses = { payment_dispute_and_refund: 15, cancellation: 15, wrong_item: 12, damaged_item: 12, missing_item: 15, refund: 10, return_or_exchange: 8, delivery_complaint: 8, complaint: 8 };
  const priorityReasons = requiresAction ? ["Needs seller action"] : ["No seller action needed"];
  let priorityScore = requiresAction ? 35 : 5;
  if (requiresAction) {
    priorityScore += urgency === "high" ? 30 : urgency === "medium" ? 15 : 0;
    if (urgency !== "low") priorityReasons.push(...urgencyReasons);
    if (sentiment.label === "negative") { priorityScore += 10; priorityReasons.push("Negative sentiment"); }
    if (bonuses[intent]) { priorityScore += bonuses[intent]; priorityReasons.push(`Intent: ${intent.replaceAll("_", " ")}`); }
    if (priorityFlag) { priorityScore += abuse ? 30 : 25; priorityReasons.push(abuse ? "Abusive language needs careful handling" : "Direct payment demand"); }
  }
  const result = { intent, sentiment, requiresAction, urgency, urgencyReasons, priorityFlag, priorityScore: Math.min(100, priorityScore), priorityReasons };
  return { ...result, ...refreshPriority(result, receivedAt, now) };
}

/** Re-rank cached signals for waiting time; no model or text analysis on refresh. */
export function refreshPriority(analysis, receivedAt, now = new Date()) {
  if (analysis.priorityScore === undefined) return {};
  const oldReasons = analysis.priorityReasons ?? [];
  const ageBonus = oldReasons.includes("Waiting over 24 hours") ? 10 : oldReasons.includes("Waiting over 4 hours") ? 5 : 0;
  const priorityReasons = oldReasons.filter((reason) => !reason.startsWith("Waiting over "));
  let priorityScore = analysis.priorityScore - ageBonus;
  const ageHours = Math.max(0, (now.getTime() - Date.parse(receivedAt)) / 3_600_000);
  if (analysis.requiresAction && ageHours >= 4) {
    priorityScore += ageHours >= 24 ? 10 : 5;
    priorityReasons.push(ageHours >= 24 ? "Waiting over 24 hours" : "Waiting over 4 hours");
  }
  return { priorityScore: Math.min(100, priorityScore), priorityReasons };
}
