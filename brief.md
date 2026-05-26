# autofunction — Ultragoal Brief

## Vision
Ship `autofunction` v0.1: a TypeScript library that lets you write **typed AI-powered functions** like `autoFunction("detect the theme of: ", text)` and:
- traces every call (model, tokens, latency, input hash, output) to local JSONL queryable via DuckDB,
- supports **code-shadow release** so an AI implementation can be progressively replaced by deterministic code while both run in parallel and divergence is logged,
- compares cheap (Haiku) vs smart (Sonnet) tiers through an eval harness,
- enables **autoresearch per segment** — Claude Code itself reads traces and proposes prompt/context/code improvements.

## Stack (decided)
- TypeScript + Node 22, `tsx` dev runner.
- Provider: **`claude -p --output-format json` subprocess** (Claude Code CLI). Originally planned as Vercel AI SDK + `@ai-sdk/openai-compatible` against an OpenClaw gateway, but OpenClaw `:18789` turned out to be the control UI, not an OpenAI-compat endpoint — pivoted to direct subprocess on 2026-05-26 (G002).
- Models `claude-sonnet-4-6` (smart) and `claude-haiku-4-5` (cheap).
- Zod for output schemas (JSON Schema embedded in the prompt, validated client-side — `claude -p --json-schema` rejects the `$ref` wrapper from `zod-to-json-schema`). DuckDB (`@duckdb/node-api`) for trace querying. Vitest for tests.

## Constraints
- Eval and comparison calls must default to Haiku where viable, Sonnet only when comparing or judging.
- Traces are local-first JSONL; no cloud telemetry.
- Provider boundary stays OpenAI-compatible so any drop-in (OpenClaw, NadirRouter, ccr, direct vendor) works by swapping env vars.

## Killer demo
`examples/detectTheme.ts` runs the full loop end-to-end: AI call + keyword-shadow + 3-case eval across Haiku and Sonnet.

## Out of scope for v0.1
- Hosted dashboard. The CLI (`npm run traces:query`) is the dashboard.
- Distributed tracing / OTLP. JSONL only.
- Auto-promotion of shadow code. `prefer-shadow` mode exists, but the human decides when to flip.
