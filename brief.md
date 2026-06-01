# autofunction — Brief

## Vision

Ship `autofunction` as a TypeScript library that lets you write **typed AI-powered functions** like `autoFunction("detect the theme of: ", text)` and:

- traces every call (model, tokens, latency, input hash, output) to local JSONL queryable via DuckDB,
- supports **code-shadow release** so an AI implementation can be progressively replaced by deterministic code while both run in parallel and divergence is logged,
- compares cheap (Haiku) vs smart (Sonnet) tiers — or any pair of provider models — through an eval harness,
- enables **autoresearch per segment** — a coding agent reads traces and proposes prompt/context/code improvements.

## Stack

- TypeScript + Node 22, `tsx` dev runner.
- Provider: **Vercel AI SDK** (`ai@6`). `autoFunction` accepts any `LanguageModel` from `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/openai-compatible`, or any user-supplied implementation of the SDK's language-model interface.
- Built-in `claudeP({ model })` adapter wraps the Claude Code CLI (`claude -p --output-format json`) as a `LanguageModel`, so the local-CLI experience is preserved.
- Zod for output schemas (`generateObject` handles JSON-schema injection + validation).
- DuckDB (`@duckdb/node-api`) for trace querying. Vitest for tests.

## Constraints

- Eval and comparison calls should default to cheap-tier models where viable, smart-tier only when comparing or judging.
- Traces are local-first JSONL; no cloud telemetry.
- Provider boundary stays SDK-native — any ai-sdk-compatible provider drops in by changing one import.

## Killer demo

`examples/detectTheme.ts` runs the full loop end-to-end: AI call with `@ai-sdk/anthropic`, keyword-shadow comparison, and a multi-tier eval across Haiku and Sonnet.

## Out of scope

- Hosted dashboard. The CLI (`npm run traces:query`) is the dashboard.
- Distributed tracing / OTLP. JSONL only.
- Auto-promotion of shadow code. `prefer-shadow` mode exists, but the human decides when to flip.
