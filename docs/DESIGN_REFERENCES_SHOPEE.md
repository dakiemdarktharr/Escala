# Shopee Seller Centre design references

This is a short product-design synthesis for Escala. Shopee is a reference for familiar seller operations patterns; Escala is an independent product and must not imply affiliation or reuse Shopee branding/assets.

## Observed principles and patterns

- Shopee's design team describes Seller Centre's modular design system as combining style/interaction guidelines, a reusable UI kit, and a developer component library. It names efficiency, accuracy/predictability, and inspiration as design principles. [Shopee design team interview](https://shopee.sg/blog/shopees-design-team-influences-product-brand-design-southeast-asia/)
- Shopee seller education material describes Seller Centre as the place sellers manage routine shop operations and performance. Seller workflows are organized around persistent navigation and task-specific work areas. [Shopee seller guide](https://shopee.jp/opening/step5/)
- Official Seller Centre chat education material shows a conversation-list plus active chat work area; official chat guide screenshots include queue categories, search, and contextual controls. [Shopee Seller Chat guide](https://seller.shopee.com.my/edu/article/20165/about-shopee-seller-chat)
- Official seller materials also group operational tasks such as products, inventory, orders, and performance in the same seller-facing workspace. [Shopee seller center overview](https://seller.shopee.sg/edu/article/6714)

These references are not a pixel-level specification of the current localized Shopee UI. Do not claim proposed Escala color values or timings are official Shopee tokens.

## Apply to Escala

- Messaging-first Inbox navigation; supporting knowledge and activity are context tabs beside the active conversation.
- Three work areas: prioritized queue, selected conversation/reply workspace, and evidence/order context. Keep queue search and status filters near the queue; put the action and risk explanation next to the draft.
- Use clear hierarchy, predictable placement, concise labels, stable layouts, and reusable components. Make the next action and its evidence legible before decoration.
- Use a warm orange accent as an Escala working token, restrained neutral surfaces, and semantic risk badges with text/icons (never color alone). Proposed palette values are design choices, not Shopee specifications.
- Short transitions may clarify drawer/panel changes; honor `prefers-reduced-motion`. Avoid attention-grabbing animation for risk state.
- On small screens, focus on one work area at a time and make queue/context available through accessible drawers.

## Owner-directed messaging redesign (2026-09-28)

The owner's warm graphite palette and Messenger/WhatsApp familiarity now govern the existing inbox. This is an Escala design direction, not a claim that these are Shopee tokens. Queue rows show latest messages with at most two status chips. Compact chat headers link to Analysis; buyer/seller bubbles remain distinct from unsent copilot drafts. The bottom composer has its own layout space while history, context and long copilot details scroll independently. System/Light/Dark preference uses shared CSS variables and the existing app shell. Exact palette values and verification limits are in README.
