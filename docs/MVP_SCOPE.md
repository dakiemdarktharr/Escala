# Escala MVP implementation brief

## Product outcome

Deliver an autonomous seller inbox in the existing Escala architecture. New buyer events are processed in the background; deterministic policy permits only verified, safe simulated replies while ON. Sensitive/uncertain drafts preload for seller review. A structured opening brief explains persisted activity and current attention backlog. No real marketplace sending or order mutation is authorized.

## Equal worker split

| Worker | Owned scope | Files |
| --- | --- | --- |
| `build_1` (Astra) | Responsive seller inbox UI, visual system, navigation, conversation queue/detail, evidence/order context, seller decision controls, accessible loading/error/empty states | `src/app/**`, `src/components/**`, `src/styles/**`, frontend-only assets/config as coordinated |
| Claude Code + DeepSeek V4 Pro | Next.js API routes, MongoDB repositories/index/seed, OpenAI Responses adapter, deterministic policy/urgency, grounding, recommendation and decision audit persistence, API validation/fallback | `src/app/api/**`, `src/server/**`, `src/domain/**` implementation helpers, persistence/config docs as coordinated |

`src/domain/contracts.ts` is the shared API contract and is owned by the orchestrator. Workers should import it and not change it without coordination. Keep UI and API implementation in their owned paths. No worker commits; integration and sole commit belong to the orchestrator.

## User journeys

1. Open the seeded inbox and see counts plus sorted urgency/reason labels.
2. Select a thread and review buyer messages, product/order snapshot, and relevant verified evidence.
3. Open an automatically prepared recommendation. Provider/classifier/grounding failure remains held for seller review; regeneration is an explicit optional action.
4. Review/edit/approve/send through simulated transport, discard, mark manual, escalate or explicitly resolve. No marketplace message or order mutation occurs.
5. Reopen the page and see persisted state and audit history.

## Acceptance criteria

- MongoDB Atlas backs MVP data and can be pinged through the app's health endpoint; seed data is synthetic and idempotent.
- OpenAI is called server-side only with `OPENAI_API_KEY`, model `gpt-5.6-luna`, reasoning effort `xhigh`; API secrets never enter browser bundles or logs.
- LLM output is treated as untrusted. Structured output is schema-validated and deterministic policy can downgrade/block any proposed automatic action.
- Each recommendation and seller decision has a timestamped audit record, policy version, reason/evidence IDs, and actor/action.
- The app works at desktop and mobile widths, provides clear loading/empty/error states, and uses keyboard-visible controls and reduced-motion support.
- No real Shopee integration, external sending, order mutation, or copied DOCRELAY code/assets.
- `npm run lint`, `npm run typecheck`, and `npm run build` pass once configured. User requested the app be tested and started.
## Environment

See `.env.example`. Runtime model configuration is `OPENAI_MODEL=gpt-5.6-luna` and `OPENAI_REASONING_EFFORT=xhigh`. `OPENAI_API_KEY` belongs only to the Escala runtime. `DEEPSEEK_API_KEY` belongs only to Claude Code. `VERCEL_TOKEN` is to be created by the user in the Vercel account and pasted into ignored `.env.local`.
