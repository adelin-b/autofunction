# autofunction

> Typed AI-powered functions with full observability, multi-tier eval, code-shadow release, and an autoresearch loop. Pluggable provider via the **Vercel AI SDK** — bring any `LanguageModel`.

## Pipeline

```
                              autoFunction(prompt, input, opts)
                                          │
                  ┌───────────────────────┼───────────────────────┐
                  ▼                       ▼                       ▼
            ┌──────────┐           ┌──────────┐           ┌────────────────┐
            │  prompt  │           │  input   │           │     opts       │
            │ (string) │           │  (any)   │           │                │
            └─────┬────┘           └─────┬────┘           │  model?        │
                  │                      │                │  models?+tier  │
                  │                      │                │  schema?       │
                  └──────────┬───────────┘                │  name          │
                             │                            │  abortSignal   │
                             ▼                            └───────┬────────┘
                      ┌─────────────┐                             │
                      │ renderPrompt│                             │
                      │             │                             │
                      │ template +  │                             │
                      │ {{input}} or│                             │
                      │ appended    │                             │
                      └──────┬──────┘                             │
                             │                                    │
                             ▼                                    │
                      ┌─────────────┐                             │
                      │ resolveModel│ ◀──── tier ─────────────────┘
                      │             │       (key into models)
                      │ model |     │
                      │ models[t]   │
                      └──────┬──────┘
                             │
                             ▼
              ┌────────────────────────────────────┐
              │     ai-sdk LanguageModel            │
              │  ─────────────────────────────────  │
              │   ANY model that satisfies it:      │
              │     @ai-sdk/anthropic               │
              │     @ai-sdk/openai                  │
              │     @ai-sdk/openai-compatible       │
              │     claudeP({ model })  ◀── built-in│
              │     custom user impls               │
              └──────────────────┬──────────────────┘
                                 │
                       generateObject(schema)  ──── if opts.schema set
                                 │           OR
                       generateText()                ──── plain text
                                 │
                                 ▼
                       ┌─────────────────┐
                       │  result + usage │
                       │  text | object  │
                       │  finishReason   │
                       └────────┬────────┘
                                │
              ┌─────────────────┼────────────────┐
              │                 │                │
              ▼                 ▼                ▼
       ┌─────────┐      ┌─────────────┐   ┌─────────────┐
       │ unwrap  │      │ zod validate│   │ writeTrace  │
       │ if no   │      │ (throws on  │   │ JSONL append│
       │ schema  │      │  mismatch — │   │ per-dayfile │
       │         │      │ via ai-sdk) │   │ serialised  │
       └────┬────┘      └──────┬──────┘   └──────┬──────┘
            │                  │                 │
            └────────┬─────────┘                 │
                     │                           │
                     ▼                           ▼
            ┌──────────────────────────────────────────────┐
            │  { output, traceId, provider, model,         │
            │    latencyMs, costUsd, usage, finishReason } │
            └──────────────────────────────────────────────┘
                              │
              ┌───────────────┴──────────────┐
              ▼                              ▼
      ┌────────────────┐             ┌────────────────┐
      │  withShadow    │             │    evalSet     │
      │  ──────────    │             │   ──────────   │
      │  ai ∥ code     │             │  N cases ×    │
      │                │             │  M tiers      │
      │  mode:         │             │               │
      │   ai           │             │  → matchRate  │
      │   shadow       │             │    perTier    │
      │   compare      │             │  → avgLatency │
      │   prefer-shadow│             │               │
      │                │             │               │
      │  → diverged?   │             │               │
      │    source      │             │               │
      └────────┬───────┘             └────────┬──────┘
               │                              │
               └──────────────┬───────────────┘
                              │
                              ▼
                  ┌────────────────────────┐
                  │  DuckDB view over      │
                  │  traces/*.jsonl        │
                  │  ──────────────────    │
                  │  npm run traces:query  │
                  │  + autoresearch loop:  │
                  │    baseline → V2 →     │
                  │    shadow-code         │
                  └────────────────────────┘
```

## Install

`package.json` is `"private": true` — install from the git repo:

```sh
npm install git+https://github.com/adelin-b/autofunction.git
```

Or clone locally:

```sh
git clone https://github.com/adelin-b/autofunction.git
cd autofunction
cp .env.example .env   # fill in ANTHROPIC_API_KEY or rely on `claude` CLI auth
npm install
npm test
```

## Quick start

```ts
import { z } from "zod";
import { anthropic } from "@ai-sdk/anthropic";
import { autoFunction } from "autofunction";

const ThemeSchema = z.object({
  theme: z.enum(["tech", "politics", "sports", "finance", "lifestyle", "health", "other"]),
  confidence: z.number().min(0).max(1),
});

const { output, traceId, model, provider, latencyMs, usage, finishReason } =
  await autoFunction(
    "Classify the dominant theme of the following text.",
    "Senate passes new tax bill after months of debate.",
    {
      name: "detectTheme",
      model: anthropic("claude-haiku-4-5"),
      schema: ThemeSchema,
    }
  );
```

Every call is **traced** to JSONL. You can later swap the AI implementation for a deterministic code shadow (`withShadow`), compare cheap vs. smart models with an **eval harness** (`evalSet`), and **autoresearch** prompt + code changes from the traces.

## Why

LLM-backed app code is opaque, expensive, and slow. `autofunction` lets you:

1. **Start fast** — write `autoFunction(prompt, input, { model, schema })` and ship a typed result.
2. **Watch everything** — every call is traced (provider, model, tokens, latency, input hash, output, finishReason) to local JSONL queryable via DuckDB.
3. **Shadow-release code** — once a pattern crystallises, write a code version, run both in parallel (`withShadow`), and only promote when divergence is low.
4. **Compare models cheaply** — `evalSet` runs the same cases through Haiku and Sonnet (or any pair) and reports match rate + latency per tier.
5. **Autoresearch per segment** — a coding agent can read the traces and propose better prompts, context windows, or code shadows.

## Provider — any LanguageModel

`autoFunction` accepts any `LanguageModel` from the Vercel AI SDK. Three common forms:

```ts
// 1. Anthropic via the official SDK provider
import { anthropic } from "@ai-sdk/anthropic";
const m1 = anthropic("claude-haiku-4-5");

// 2. OpenAI (or any other ai-sdk provider — drop in the same way)
import { openai } from "@ai-sdk/openai";
const m2 = openai("gpt-4o-mini");

// 3. Built-in claudeP adapter — wraps `claude -p --output-format json` as a
//    LanguageModelV2. Auth = whatever your local `claude` binary is logged
//    in with (OAuth via `claude /login`, or ANTHROPIC_API_KEY in env).
import { claudeP } from "autofunction";
const m3 = claudeP({ model: "claude-haiku-4-5" });
```

All three are interchangeable at the `autoFunction({ model: … })` callsite.

## Schema validation

```ts
import { z } from "zod";
import { anthropic } from "@ai-sdk/anthropic";
import { autoFunction } from "autofunction";

const User = z.object({ name: z.string(), age: z.number().int().nonnegative() });

const { output } = await autoFunction(
  "Extract the user mentioned in the text.",
  "Adelin, 32, lives in Paris.",
  { name: "extractUser", model: anthropic("claude-haiku-4-5"), schema: User }
);
// output is typed as { name: string; age: number }
```

`generateObject` (from `ai@6`) handles JSON-schema injection + parsing + validation. Zod validation errors throw — and the trace gets `ok: false` with the error name.

## Tracing

Every call appends a line to `traces/<YYYY-MM-DD>.jsonl`. Per-process serialisation keyed by dayfile keeps lines well-formed under concurrency.

Trace fields:

| field | notes |
|---|---|
| `id` | UUID per call |
| `ts` | ISO timestamp |
| `fn` | logical function name (`opts.name`) |
| `variant` | `ai` / `shadow-code` / `shadow-eval` |
| `tier` | only set when `models` + `tier` is used |
| `provider` | ai-sdk provider name (e.g. `anthropic`) |
| `model` | provider-specific model id |
| `inputHash` | sha256 prefix of the input |
| `input`, `output` | as-is |
| `inputTokens`, `outputTokens` | as reported by the provider |
| `costUsd` | **only populated by `claudeP`** (reads `total_cost_usd` from `claude -p`). See [Cost](#cost). |
| `finishReason` | ai-sdk finish reason |
| `latencyMs` | wall-clock |
| `ok`, `errorKind`, `errorMessage` | failure surface |

Query the store:

```sh
npm run traces:query
```

…opens a DuckDB view over `traces/*.jsonl` and prints a per-fn/variant/tier rollup.

## `withShadow` — code-shadow release

Run AI and deterministic code in parallel, log divergence, and progressively promote the code path:

```ts
import { autoFunction, withShadow } from "autofunction";
import { anthropic } from "@ai-sdk/anthropic";

const detect = withShadow<string, Theme>(
  async (text) => {
    const r = await autoFunction<string, Theme>("classify…", text, {
      name: "detectTheme",
      model: anthropic("claude-haiku-4-5"),
      schema: ThemeSchema,
    });
    return { output: r.output, traceId: r.traceId };
  },
  (text) => detectThemeShadow(text),   // pure-code version
  { name: "detectTheme", mode: "compare", equals: (a, b) => a.theme === b.theme }
);
```

Modes:

- `ai` — only run AI; shadow code is skipped entirely.
- `shadow` — only run the code path; AI side is skipped (hard cutover).
- `compare` — run both, log shadow trace, return AI output, flag divergence. (default)
- `prefer-shadow` — run both, log, return SHADOW output, flag divergence.

## `evalSet` — multi-tier comparison

```ts
import { evalSet } from "autofunction";
import { anthropic } from "@ai-sdk/anthropic";

const report = await evalSet(cases, {
  name: "detectTheme",
  promptTemplate: "Classify the dominant theme of the following text.",
  schema: ThemeSchema,
  tiers: {
    cheap: anthropic("claude-haiku-4-5"),
    smart: anthropic("claude-sonnet-4-6"),
  },
  equals: (a, b) => a.theme === b.theme,
});

console.log(report.perTier);
// { cheap: { n: 3, avgLatencyMs: …, matchRate: 0.67 },
//   smart: { n: 3, avgLatencyMs: …, matchRate: 1.0 } }
```

Tiers are free-form labels — you can have `{ haiku, sonnet, gpt4o }` or any set.

## Autoresearch loop

`examples/autoresearch.ts` runs the loop end-to-end on a regulator-action adversarial set: baseline prompt → frame-disambiguation V2 prompt → matchRate delta. See [`docs/Autoresearch.md`](docs/Autoresearch.md) for the worked example.

**Caveat — the worked example uses n=4, which is anecdotal, not statistically meaningful.** Rerun at n≥20 before drawing conclusions.

## Layout

```
src/
  autoFunction.ts       typed AI call + tracing (uses ai-sdk generateText/Object)
  claudeP.ts            LanguageModelV2 adapter for `claude -p` subprocess
  trace.ts              JSONL append-only tracer (serialised per dayfile)
  shadow.ts             withShadow() — run AI + code shadow in parallel
  eval.ts               evalSet() — multi-tier comparison
  db.ts                 DuckDB view over traces/*.jsonl
  cli/traces.ts         `npm run traces:query`
  examples-shared/
    themeSchema.ts      shared ThemeSchema imported by example files
  index.ts              public exports
examples/
  smoke.ts              Haiku + Sonnet round-trip via @ai-sdk/anthropic
  detectTheme.ts        schema-validated single call
  shadow-demo.ts        AI + code shadow paired trace
  eval-demo.ts          cheap vs smart eval rollup
  autoresearch.ts       baseline-vs-improved prompt comparison
  claudeP-demo.ts       using the built-in claudeP adapter as the model arg
tests/                  vitest specs for trace, shadow, autoFunction, claudeP
traces/                 gitignored JSONL trace store
```

## Cost

The Vercel AI SDK does **not** surface a per-call USD cost for most providers — it only returns token counts in `usage`. As a result, `costUsd` in the trace + result is `undefined` for most ai-sdk providers.

The built-in `claudeP()` adapter is the exception: `claude -p` reports `total_cost_usd` in its JSON output, which the adapter publishes via `providerMetadata["autofunction-claude-p"].costUsd`, and `autoFunction` plumbs it through to `costUsd` on the result + trace.

For other providers, compute cost out of band:

1. Query the provider's billing API separately, or
2. Maintain a price table keyed by `(provider, modelId)` and multiply with `usage.inputTokens` / `usage.outputTokens`.
