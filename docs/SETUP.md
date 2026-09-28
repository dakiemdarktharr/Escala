# Escala setup

## Prerequisites

- Node.js 20 or newer;
- npm;
- Git.

The current workspace was inspected with Node `v24.18.0`, npm `11.16.0`, pnpm available, and no Yarn dependency.

## Fixture validation

From the repository root:

```powershell
npm run validate:demo
```

This parses the local fixtures, checks required scenarios, verifies unique IDs, and verifies every message evidence reference points to a knowledge document.

## Environment

Create `.env.local` from `.env.example`. Set `MONGODB_URI`, `OPENAI_API_KEY`, `OPENAI_MODEL=gpt-5.6-luna`, and `OPENAI_REASONING_EFFORT=xhigh`. Keep `ESCALA_ENABLE_EXTERNAL_SEND=false`. The OpenAI key is used only by the Escala server; `DEEPSEEK_API_KEY` is for the Claude Code backend worker only. Never commit keys.

## Application setup

Install dependencies and start the Next.js MVP from the repository root:

```powershell
npm install
npm run dev
```

The MVP persists synthetic conversations, local seller replies and decisions in MongoDB (Atlas or a local replica set). Transactions require a replica set. Missing OPENAI_API_KEY uses clearly labeled templates with null confidence; manual replies still work. Restart Next.js after adding the key. It does not require Shopee credentials and must not send external messages or mutate orders. A Vercel token must be created by the project owner and added to ignored `.env.local` before deployment.

## Verification checklist

- `npm run validate:demo` passes;
- all links in [README.md](../README.md) resolve to files in this repository;
- the demo data includes safe, ambiguous, urgent, high-risk, missing-evidence, and model-failure cases;
- the team can state which behavior is real, mocked, synthetic, or not implemented;
- no external side effect is enabled by default.
- `npm run lint`, `npm run typecheck`, and `npm run build` pass before deployment;
- `/api/health` confirms database connectivity without exposing credentials.
