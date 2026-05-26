import { writeTrace, newTraceId, hashInput, type TraceEvent } from "./trace.js";

export type ShadowMode = "off" | "log-only" | "prefer-shadow";

export type ShadowOpts<O> = {
  name: string;
  mode?: ShadowMode;
  equals?: (a: O, b: O) => boolean;
};

export type ShadowResult<O> = {
  output: O;
  source: "ai" | "shadow";
  diverged: boolean;
  aiTraceId: string;
  shadowTraceId: string;
};

export function withShadow<I, O>(
  ai: (input: I) => Promise<{ output: O; traceId: string }>,
  shadow: (input: I) => O | Promise<O>,
  opts: ShadowOpts<O>
): (input: I) => Promise<ShadowResult<O>> {
  const mode: ShadowMode = opts.mode ?? "log-only";
  const eq = opts.equals ?? defaultEquals<O>;

  return async (input: I): Promise<ShadowResult<O>> => {
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

    const source: "ai" | "shadow" =
      mode === "prefer-shadow" ? "shadow" : "ai";
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
