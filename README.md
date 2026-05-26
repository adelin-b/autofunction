# autofunction

> Typed AI-powered functions with full observability, multi-model eval, and code-shadow autoresearch loop.

```ts
import { autoFunction, z } from "autofunction";

const ThemeSchema = z.object({
  theme: z.enum(["tech", "politics", "sports", "finance", "lifestyle", "health", "other"]),
  confidence: z.number().min(0).max(1),
});

const { output, traceId, model, latencyMs } = await autoFunction(
  "Classify the dominant theme of the following text.",
  "Senate passes new tax bill after months of debate.",
  { name: "detectTheme", schema: ThemeSchema, tier: "cheap" }
);
```

Every call is **traced** to JSONL. You can later swap the AI implementation for a deterministic code shadow (`withShadow`), compare cheap vs. smart models with an **eval harness** (`evalSet`), and **autoresearch** prompt + code changes from the traces.

## Why

LLM-backed app code is opaque, expensive, and slow. `autofunction` lets you:

1. **Start fast** — write `autoFunction(prompt, input, schema)` and ship a typed result.
2. **Watch everything** — every call is traced (model, tokens, latency, input hash, output) to local JSONL queryable via DuckDB.
3. **Shadow-release code** — once a pattern crystallizes, write a code version, run both in parallel (`withShadow`), and only promote when divergence is low.
4. **Compare models cheaply** — `evalSet` runs the same cases through Haiku and Sonnet and reports match rate + latency per tier.
5. **Autoresearch per segment** — Claude Code itself can read the traces and propose better prompts, context windows, or code shadows.

## Provider

Defaults to the OpenClaw gateway (Claude CLI fronted by an OpenAI-compatible HTTP layer). Configure in `.env`:

```
AUTOFN_BASE_URL=http://127.0.0.1:18789/v1
AUTOFN_API_KEY=<openclaw gateway.auth.token from ~/.openclaw/openclaw.json>
AUTOFN_MODEL_SMART=claude-sonnet-4-6
AUTOFN_MODEL_CHEAP=claude-haiku-4-5
AUTOFN_TRACES_DIR=./traces
```

## Layout

```
src/
  autoFunction.ts   typed AI call + tracing
  provider.ts       openclaw OpenAI-compatible provider + model tiers
  trace.ts          JSONL append-only tracer
  shadow.ts         withShadow() — run AI + code shadow in parallel
  eval.ts           evalSet() — multi-tier comparison
  db.ts             DuckDB view over traces/*.jsonl
  cli/traces.ts     `npm run traces:query`
  index.ts          public exports
examples/
  detectTheme.ts    end-to-end: AI + shadow + eval
tests/              vitest specs for trace + shadow
traces/             gitignored JSONL trace store
```

## Quick start

```sh
cp .env.example .env   # then paste openclaw token
npm install
npm test
npm run example:detect-theme
npm run traces:query
```

## Workflow

Ultragoal stories live in `.omc/ultragoal/`. Run `omc ultragoal status` for current plan and `omc ultragoal complete-goals` for the active-session handoff.
