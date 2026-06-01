import type { ZodSchema } from "zod";
import { generateObject, generateText, type LanguageModel } from "ai";
import { writeTrace, newTraceId, hashInput, type TraceEvent } from "./trace.js";

/** Tier label used by `models`/`tier` for multi-model setups. */
export type Tier = string;

export type AutoFunctionOpts<O> = {
  /** Logical function name — used as the `fn` field in traces. */
  name: string;
  /**
   * Zod schema for the output. When set, `generateObject` is called and the
   * result is the parsed + validated object. When omitted, `generateText` is
   * called and the result is a plain string.
   */
  schema?: ZodSchema<O>;
  /** Optional abort signal forwarded to the underlying ai-sdk call. */
  abortSignal?: AbortSignal;
} & (
  | {
      /** Single model — any `LanguageModel` from `@ai-sdk/*` (or `claudeP()`). */
      model: LanguageModel;
      models?: never;
      tier?: never;
    }
  | {
      /** Multi-tier model bag. Pick which one to run with `tier`. */
      models: Record<string, LanguageModel>;
      /** Which key of `models` to use. Defaults to `"cheap"` if present, else first key. */
      tier?: string;
      model?: never;
    }
);

export type AutoFunctionResult<O> = {
  output: O;
  traceId: string;
  /** Provider-specific model id (e.g. "claude-haiku-4-5"). */
  model: string;
  /** ai-sdk provider name (e.g. "anthropic"). */
  provider: string;
  latencyMs: number;
  /**
   * USD cost — only populated by providers that report it (currently just
   * the built-in `claudeP()` adapter). Otherwise `undefined`; see README.
   */
  costUsd: number | undefined;
  usage: {
    inputTokens: number | undefined;
    outputTokens: number | undefined;
    totalTokens: number | undefined;
  };
  finishReason: string;
};

export async function autoFunction<I, O = string>(
  promptTemplate: string,
  input: I,
  opts: AutoFunctionOpts<O>
): Promise<AutoFunctionResult<O>> {
  const { model, tier } = resolveModel(opts);
  const traceId = newTraceId();
  const userPrompt = renderPrompt(promptTemplate, input);
  const started = Date.now();

  // `LanguageModel` is `string | LanguageModelV2 | LanguageModelV3`; the
  // string form is the gateway-id case (e.g. "anthropic/claude-haiku-4-5").
  // We don't accept strings from users in autoFunction's typed API — the
  // discriminated union enforces objects — but `resolveModel` returns
  // whatever the caller passed. Surface a clean error if a string slipped
  // through (e.g. via `models["cheap"]: "anthropic/…"`).
  if (typeof model === "string") {
    throw new Error(
      `autoFunction: gateway-id model strings ("${model}") are not supported. Pass a LanguageModel instance, e.g. anthropic("claude-haiku-4-5") or claudeP({ model: "..." }).`
    );
  }

  const providerName = model.provider;
  const modelId = model.modelId;

  let output: O | undefined;
  let hasOutput = false;
  let ok = true;
  let errorKind: string | undefined;
  let errorMessage: string | undefined;
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  let totalTokens: number | undefined;
  let finishReason = "unknown";
  let costUsd: number | undefined;

  try {
    if (opts.schema) {
      const res = await generateObject({
        model,
        schema: opts.schema,
        prompt: userPrompt,
        abortSignal: opts.abortSignal,
      });
      output = res.object as O;
      inputTokens = res.usage.inputTokens;
      outputTokens = res.usage.outputTokens;
      totalTokens = res.usage.totalTokens;
      finishReason = res.finishReason;
      costUsd = extractCostUsd(providerName, res.providerMetadata);
    } else {
      const res = await generateText({
        model,
        prompt: userPrompt,
        abortSignal: opts.abortSignal,
      });
      output = res.text as unknown as O;
      inputTokens = res.usage.inputTokens;
      outputTokens = res.usage.outputTokens;
      totalTokens = res.usage.totalTokens;
      finishReason = res.finishReason;
      costUsd = extractCostUsd(providerName, res.providerMetadata);
    }
    hasOutput = true;
  } catch (e: unknown) {
    ok = false;
    errorKind = e instanceof Error ? e.name : "unknown";
    errorMessage = e instanceof Error ? e.message : String(e);
    throw e;
  } finally {
    const latencyMs = Date.now() - started;
    const event: TraceEvent = {
      id: traceId,
      ts: new Date().toISOString(),
      fn: opts.name,
      variant: "ai",
      tier,
      provider: providerName,
      model: modelId,
      inputHash: hashInput(input),
      input,
      output: hasOutput ? (output as unknown) : null,
      inputTokens,
      outputTokens,
      costUsd,
      finishReason,
      latencyMs,
      ok,
      errorKind,
      errorMessage,
    };
    // Tests assert the JSONL line exists immediately after the call returns,
    // so we await; errors are swallowed because trace persistence must not
    // break the caller.
    await writeTrace(event).catch(() => {});
  }

  if (!hasOutput) {
    throw new Error("autoFunction internal: output not assigned");
  }
  return {
    output,
    traceId,
    model: modelId,
    provider: providerName,
    latencyMs: Date.now() - started,
    costUsd,
    usage: { inputTokens, outputTokens, totalTokens },
    finishReason,
  };
}

function resolveModel<O>(
  opts: AutoFunctionOpts<O>
): { model: LanguageModel; tier: string | undefined } {
  if ("model" in opts && opts.model !== undefined) {
    return { model: opts.model, tier: undefined };
  }
  if ("models" in opts && opts.models !== undefined) {
    const keys = Object.keys(opts.models);
    if (keys.length === 0) {
      throw new Error("autoFunction: `models` is empty.");
    }
    const tier =
      opts.tier ?? (keys.includes("cheap") ? "cheap" : (keys[0] as string));
    const picked = opts.models[tier];
    if (!picked) {
      throw new Error(
        `autoFunction: tier "${tier}" not found in models (have: ${keys.join(", ")}).`
      );
    }
    return { model: picked, tier };
  }
  throw new Error(
    "autoFunction: must pass either `model` or `models` in opts."
  );
}

/**
 * Best-effort cost extraction from ai-sdk `providerMetadata`. The built-in
 * `claudeP` adapter publishes USD cost under its own provider namespace; other
 * providers don't surface cost and this returns `undefined`.
 */
function extractCostUsd(
  providerName: string,
  meta: unknown
): number | undefined {
  if (!meta || typeof meta !== "object") return undefined;
  const ns = (meta as Record<string, unknown>)[providerName];
  if (!ns || typeof ns !== "object") return undefined;
  const v = (ns as Record<string, unknown>).costUsd;
  return typeof v === "number" ? v : undefined;
}

function renderPrompt(template: string, input: unknown): string {
  const inputStr =
    typeof input === "string" ? input : JSON.stringify(input, null, 2);
  if (template.includes("{{input}}")) {
    return template.replaceAll("{{input}}", inputStr);
  }
  if (inputStr.length === 0) return template;
  return `${template}\n\n${inputStr}`;
}
