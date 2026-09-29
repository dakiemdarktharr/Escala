const HARD_RISK_PATTERNS = [
  ["financial impact requires seller review", /\b(refund|refunds|refunded|charged|charge|payment|money|duplicate charge|double charged|reimburse|billing|paid twice)\b|hoàn tiền|bị trừ tiền|thanh toán|tính tiền|thu tiền/i],
  ["order changes are not performed by Escala", /\b(cancel|cancellation|change my order|modify my order|change address|change quantity|reship|reshipment|send a replacement|replacement is on the way)\b|hủy đơn|huỷ đơn|đổi đơn|đổi địa chỉ/i],
  ["delivery commitments need verified carrier information", /\b(guarantee|must arrive|deadline|before \d|by today|by tomorrow|promise delivery|arrive by)\b|cam kết giao|phải giao trước|giao đúng ngày/i],
  ["complaint or reputation risk requires seller review", /\b(post .*public|publicly|social media|report you|lawsuit|legal action|regulator|regulatory)\b|đăng công khai|bóc phốt|khiếu nại|kiện|cơ quan chức năng/i],
  ["safety or health concerns require seller review", /\b(injur|injured|injury|unsafe|safety|allergy|allergic|poison|hazard|medical|health issue)\b|dị ứng|chấn thương|bị thương|không an toàn|sức khỏe|ngộ độc/i],
  ["account, identity, or security issues require seller review", /\b(account hacked|password|credential|identity|stolen account|unauthorized access|security breach|personal data)\b|mật khẩu|tài khoản bị hack|đánh cắp tài khoản|dữ liệu cá nhân/i],
  ["exceptional discounts or compensation require seller review", /\b(discount|coupon|compensation|compensate|free replacement|store credit|waive the fee)\b|giảm giá|mã giảm|bồi thường|đền bù/i],
  ["requested external actions need seller approval", /\b(send|issue|apply|dispatch|ship it|change|delete|publish)\b.{0,35}\b(now|immediately|for me|my order|the refund|a discount|a replacement)\b|gửi ngay|thực hiện giúp|xóa đơn/i],
  ["replacement or reshipment requires seller approval", /\b(?:replace my|replace the|resend|reship|reshipment|send (?:me )?(?:a |another )?replacement|ship (?:a )?replacement)\b|gửi lại hàng|gửi hàng thay thế/i],
  ["returns or exchanges need seller authorization", /\b(?:exchange (?:it|my|this|the)|return (?:it|my|this|the)|(?:want|need|can i) (?:a |an |to )?(?:return|exchange))\b|đổi hàng|trả hàng/i],
  ["fraud, disputes and policy exceptions require seller review", /\b(?:fraud|chargeback|dispute|policy exception|make an exception|change (?:the |my )?payment|change (?:the |my )?address)\b/i],
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

/** Compatibility action projection of the single reply delivery gate. */
export function evaluateRecommendation({ text, scenario, confidence, missingInformation = [], evidenceIds = [], threshold = .9, hasApprovedAnswer = false }) {
  const grounded = REQUIRED_SAFE_EVIDENCE.every((id) => evidenceIds.includes(id)) && hasApprovedAnswer
    && scenario === "safe_faq" && missingInformation.length === 0;
  const decision = replyDeliveryDecision({ text, draft: replyTemplate(text, evidenceIds).draft,
    confidence, threshold, automaticGrounded: grounded });
  return { ...decision, action: decision.deliveryState === "AUTO_SEND" ? "AUTO_REPLY"
    : missingInformation.length ? "ASK_CLARIFICATION" : "DRAFT_FOR_SELLER" };
}
export const APPROVED_AVAILABILITY_ANSWER =
  "Size M is currently listed as available. Standard delivery to Ho Chi Minh City is normally estimated at 2–4 business days after dispatch. This is an estimate, not a guarantee.";

/** Reviewed fallback wording, never represented as model output or calibrated confidence. */
export function replyTemplate(text, evidenceIds = []) {
  const intent = detectIntent(text), vietnamese = routeLanguage(text) !== "english";
  const choices = {
    refund: ["Review refund request", "I can help review your refund request. Could you confirm your order number? No refund has been issued yet.", "Shop có thể kiểm tra yêu cầu hoàn tiền. Bạn gửi giúp mã đơn hàng nhé. Yêu cầu chưa được xử lý hoàn tiền."],
    payment_dispute_and_refund: ["Review payment discrepancy", "I’m sorry about the payment issue. Please share the order number so we can verify the charge and review the request.", "Shop xin lỗi về vấn đề thanh toán. Bạn gửi mã đơn để shop kiểm tra giao dịch và yêu cầu nhé."],
    cancellation: ["Review cancellation request", "I can review your cancellation request. Please confirm the order number; cancellation has not been confirmed yet.", "Shop có thể kiểm tra yêu cầu hủy đơn. Bạn gửi mã đơn nhé; đơn chưa được xác nhận hủy."],
    wrong_item: ["Ask for order number and a photo", "I’m sorry you received a different item. Could you share your order number and a photo of the item and size label so we can check?", "Shop xin lỗi vì bạn nhận hàng khác với đơn đặt. Bạn gửi mã đơn và ảnh sản phẩm, nhãn size để shop kiểm tra nhé."],
    damaged_item: ["Ask for a photo and order number", "I’m sorry the item arrived damaged. Could you share your order number and a photo of the damage so we can review it?", "Shop xin lỗi vì hàng bị hỏng. Bạn gửi mã đơn và ảnh phần hỏng để shop kiểm tra nhé."],
    order_status: ["Ask buyer for order number", "I’m sorry you’re still waiting. Could you share your order number so we can check the shipment status?", "Bạn gửi mã đơn để shop kiểm tra tình trạng giao hàng nhé."],
    delivery_complaint: ["Check shipment information", "I’m sorry you’re still waiting. Please share your order number so we can check the shipment status.", "Shop xin lỗi vì bạn vẫn đang chờ. Bạn gửi mã đơn để shop kiểm tra nhé."],
    return_or_exchange: ["Check exchange details", "Could you share your order number, delivery date, and the size you need so we can check the exchange options?", "Bạn gửi mã đơn, ngày nhận hàng và size muốn đổi để shop kiểm tra phương án đổi hàng nhé."],
    positive_feedback: ["Thank the buyer", "Thank you for your feedback! We’re glad you’re happy with your purchase.", "Cảm ơn bạn đã phản hồi! Shop rất vui vì bạn hài lòng với sản phẩm."],
    product_information: ["Confirm product details", "Could you share the product name or link so I can check the available options for you?", "Bạn gửi tên hoặc link sản phẩm để shop kiểm tra thông tin nhé."],
    stock_check: ["Check available options", "Could you share the product name or link and the option you need so I can check availability?", "Bạn gửi tên sản phẩm và lựa chọn cần mua để shop kiểm tra còn hàng nhé."],
  };
  if (intent === "product_and_shipping_faq" && REQUIRED_SAFE_EVIDENCE.every((id) => evidenceIds.includes(id))) {
    return { intent, recommendedStep: "Reply with product and delivery information", draft: APPROVED_AVAILABILITY_ANSWER };
  }
  const selected = choices[intent] ?? ["Review uncertain intent", "Could you share a little more detail about the product or order and what you need help with?", "Bạn cho shop thêm thông tin về sản phẩm hoặc đơn hàng và vấn đề cần hỗ trợ nhé."];
  return { intent, recommendedStep: selected[0], draft: selected[vietnamese ? 2 : 1] };
}

export function hasUnverifiedActionClaim(draft) {
  const claims = normalizeText(draft).replace(/\bno refund has been issued yet\b/g, "");
  if (/\b(?:i[ '\u2019]?ll|we[ '\u2019]?ll) (?:refund|cancel|reship|replace)|\b(?:definitely|guaranteed to|will certainly) (?:arrive|be delivered)|\b(?:reserve|reserved|guarantee) (?:your|this|the) (?:stock|item|size)\b/i.test(claims)) return true;
  return /\b(?:refund (?:has been|was|is) (?:issued|processed|approved)|(?:i|we)(?: have)? (?:cancelled|canceled|refunded|shipped|dispatched)|order (?:has been|was|is) cancel(?:led|ed)|replacement is on the way|guarantee(?:d)? (?:delivery|arrival)|will (?:refund|cancel|reship|replace)|refund approved)\b|\b(?:da hoan tien|da huy don|da gui hang thay the|se hoan tien|se huy don|se gui hang thay the|cam ket giao)\b/i.test(claims);
}

/** This gate never takes sentiment, urgency, or priority as permission. */
export function replyDeliveryDecision({ text, draft, confidence, threshold = .9, automaticGrounded = false, uncertain = false }) {
  // An explicit non-guarantee in reply wording is not a delivery promise.
  // Buyer requests are checked unchanged, including requests for guarantees.
  const replyRiskText = (draft ?? "").replace(/\b(?:not a (?:delivery-time )?guarantee|cannot guarantee|can't guarantee|is not guaranteed)\b/gi, "");
  const risk = detectHardRisk(`${text}\n${replyRiskText}`);
  const reasons = [...risk.reasons];
  if (draft && hasUnverifiedActionClaim(draft)) {
    risk.hard = true;
    reasons.push("Generated reply introduces an unverified commitment or completed action");
  }
  const hostile = /\b(?:fuck you|kill you|you idiot|you moron|you bitch|dit me|dm may|dmm|boc phot)\b/.test(normalizeText(text));
  if (hostile) reasons.push("Hostile or escalated wording needs seller judgment before an automated response");
  if (uncertain) reasons.push("Uncertain or conflicting analysis/context requires seller review");
  const validThreshold = Number.isFinite(threshold) && threshold >= .9 && threshold <= 1;
  const confident = validThreshold && Number.isFinite(confidence) && confidence >= threshold && confidence <= 1;
  if (!confident) reasons.push("Reply confidence is unavailable or below the automatic-send threshold");
  if (!draft?.trim()) return { deliveryState: "MANUAL_ONLY", risk: risk.hard ? "high" : "low", reasons };
  if (risk.hard) return { deliveryState: "APPROVAL_REQUIRED", risk: "high", reasons };
  if (!automaticGrounded) reasons.push("Draft is not a verified automatic reply; seller review required");
  return { deliveryState: confident && automaticGrounded && !hostile && !uncertain ? "AUTO_SEND" : "REVIEW_REQUIRED", risk: "low", reasons };
}

/** Mechanically grounded wording from trusted, time-bounded repository facts. */
export function groundedReply(text, context = {}, evidenceIds = [], now = new Date()) {
  const valid = (fact) => fact && evidenceIds.includes(fact.evidenceId)
    && Number.isFinite(Date.parse(fact.observedAt)) && Date.parse(fact.observedAt) <= now.getTime()
    && Date.parse(fact.validUntil) > now.getTime();
  const stock = context.stock;
  if (valid(stock) && typeof stock.productName === "string" && /^[a-z0-9 -]{1,80}$/i.test(stock.productName)
    && /^[a-z0-9 -]{1,12}$/i.test(stock.size) && typeof stock.available === "boolean"
    && /\b(?:size|stock|available|have this)\b/i.test(text) && !/\b(?:delivery|shipping)\b/i.test(text)
    && new RegExp(`\\b${stock.size}\\b`, "i").test(text)) {
    return { draft: `Size ${stock.size} of ${stock.productName} is ${stock.available ? "currently listed as available" : "currently listed as unavailable"}. Availability can change before checkout.`, evidenceIds: [stock.evidenceId] };
  }
  const tracking = context.tracking;
  if (valid(tracking) && /^[a-z0-9-]{1,40}$/i.test(tracking.orderId)
    && ["Processing", "Shipped", "In transit", "Delivered", "Delayed"].includes(tracking.status)
    && /\b(?:where|status|tracking|arriv|shipment|package|order)\b/i.test(text)) {
    return { draft: `The verified tracking snapshot for order #${tracking.orderId} shows: ${tracking.status}. This status is not a delivery-time guarantee.`, evidenceIds: [tracking.evidenceId] };
  }
  return null;
}

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
  if (/\b(?:do you have|have this|available)\b.*\bsize\b/.test(normalized) && !/\b(?:delivery|shipping)\b/.test(normalized)) return "stock_check";
  if (/\bordered (?:the )?(?:medium|small|large|size .+) (?:but |and )?(?:got|received)\b/.test(normalized)) return "wrong_item";
  if (/\bwhere (?:is|s) my (?:fucking |damn )?(?:package|parcel|shipment)\b/.test(normalized)) return "order_status";
  if (/\bcome in (?:black|white|blue|red)\b/.test(normalized)) return "product_information";
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
