import { writeTrace, newTraceId, hashInput, type TraceEvent } from "./trace.js";

/**
 * - `ai`              — only run the AI side; shadow code is skipped entirely.
 * - `shadow`          — only run the shadow code; AI side is skipped (treat as
 *                       a hard cutover that still preserves the API shape).
 * - `compare`         — run both, log the shadow trace, return AI output, flag
 *                       divergence. This is the default.
 * - `prefer-shadow`   — run both, log, return SHADOW output, flag divergence.
 */
export type ShadowMode = "ai" | "shadow" | "compare" | "prefer-shadow";

export type ShadowOpts<O> = {
  name: string;
  mode?: ShadowMode;
  equals?: (a: O, b: O) => boolean;
};

export type ShadowResult<O> = {
  output: O;
  source: "ai" | "shadow";
  /** `false` in single-side modes (`ai` / `shadow`) since there's nothing to compare. */
  diverged: boolean;
  aiTraceId: string | undefined;
  shadowTraceId: string | undefined;
};

export function withShadow<I, O>(
  ai: (input: I) => Promise<{ output: O; traceId: string }>,
  shadow: (input: I) => O | Promise<O>,
  opts: ShadowOpts<O>
): (input: I) => Promise<ShadowResult<O>> {
  const mode: ShadowMode = opts.mode ?? "compare";
  const eq = opts.equals ?? defaultEquals<O>;

  return async (input: I): Promise<ShadowResult<O>> => {
    if (mode === "ai") {
      const aiRes = await ai(input);
      return {
        output: aiRes.output,
        source: "ai",
        diverged: false,
        aiTraceId: aiRes.traceId,
        shadowTraceId: undefined,
      };
    }

    if (mode === "shadow") {
      const shadowTraceId = newTraceId();
      const started = Date.now();
      const shadowOut = await Promise.resolve(shadow(input));
      const shadowEvent: TraceEvent = {
        id: shadowTraceId,
        ts: new Date().toISOString(),
        fn: opts.name,
        variant: "shadow-code",
        inputHash: hashInput(input),
        input,
        output: shadowOut,
        latencyMs: Date.now() - started,
        ok: true,
      };
      await writeTrace(shadowEvent).catch(() => {});
      return {
        output: shadowOut,
        source: "shadow",
        diverged: false,
        aiTraceId: undefined,
        shadowTraceId,
      };
    }

    // compare | prefer-shadow: run both in parallel.
    const shadowTraceId = newTraceId();
    const shadowStarted = Date.now();
    const [aiRes, shadowOut] = await Promise.all([
      ai(input),
      Promise.resolve().then(() => shadow(input)),
    ]);

    const shadowEvent: TraceEvent = {
      id: shadowTraceId,
      ts: new Date().toISOString(),
      fn: opts.name,
      variant: "shadow-code",
      inputHash: hashInput(input),
      input,
      output: shadowOut,
      latencyMs: Date.now() - shadowStarted,
      ok: true,
      meta: { pairedAiTraceId: aiRes.traceId },
    };
    await writeTrace(shadowEvent).catch(() => {});

    const diverged = !eq(aiRes.output, shadowOut);
    const source: "ai" | "shadow" = mode === "prefer-shadow" ? "shadow" : "ai";
    const output = source === "shadow" ? shadowOut : aiRes.output;

    return {
      output,
      source,
      diverged,
      aiTraceId: aiRes.traceId,
      shadowTraceId,
    };
  };
}

function defaultEquals<O>(a: O, b: O): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}
