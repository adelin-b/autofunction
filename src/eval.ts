import { autoFunction, type AutoFunctionResult } from "./autoFunction.js";
import { writeTrace, newTraceId, hashInput, type TraceEvent } from "./trace.js";
import type { Tier } from "./provider.js";
import type { ZodSchema } from "zod";

export type EvalCase<I, O> = {
  input: I;
  expected?: O;
};

export type EvalRow<O> = {
  caseIdx: number;
  tier: Tier;
  model: string;
  output: O;
  latencyMs: number;
  matchesExpected?: boolean;
};

export type EvalReport<O> = {
  fn: string;
  rows: EvalRow<O>[];
  perTier: Record<Tier, { n: number; avgLatencyMs: number; matchRate?: number }>;
};

export type EvalOpts<O> = {
  name: string;
  promptTemplate: string;
  tiers?: Tier[];
  schema?: ZodSchema<O>;
  systemPrompt?: string;
  equals?: (a: O, b: O) => boolean;
};

export async function evalSet<I, O>(
  cases: EvalCase<I, O>[],
  opts: EvalOpts<O>
): Promise<EvalReport<O>> {
  const tiers: Tier[] = opts.tiers ?? ["cheap", "smart"];
  const eq = opts.equals ?? defaultEquals<O>;
  const rows: EvalRow<O>[] = [];

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i]!;
    for (const tier of tiers) {
      const res: AutoFunctionResult<O> = await autoFunction<I, O>(
        opts.promptTemplate,
        c.input,
        {
          name: opts.name,
          tier,
          schema: opts.schema,
          systemPrompt: opts.systemPrompt,
        }
      );
      const matchesExpected =
        c.expected !== undefined ? eq(res.output, c.expected) : undefined;
      rows.push({
        caseIdx: i,
        tier,
        model: res.model,
        output: res.output,
        latencyMs: res.latencyMs,
        matchesExpected,
      });
    }
  }

  const perTier = Object.fromEntries(
    tiers.map((t) => {
      const tierRows = rows.filter((r) => r.tier === t);
      const withExpected = tierRows.filter((r) => r.matchesExpected !== undefined);
      const matchRate =
        withExpected.length === 0
          ? undefined
          : withExpected.filter((r) => r.matchesExpected).length / withExpected.length;
      return [
        t,
        {
          n: tierRows.length,
          avgLatencyMs:
            tierRows.reduce((a, r) => a + r.latencyMs, 0) /
            Math.max(tierRows.length, 1),
          matchRate,
        },
      ];
    })
  ) as Record<Tier, { n: number; avgLatencyMs: number; matchRate?: number }>;

  const evalTraceId = newTraceId();
  const evalEvent: TraceEvent = {
    id: evalTraceId,
    ts: new Date().toISOString(),
    fn: opts.name,
    variant: "shadow-eval",
    inputHash: hashInput({ n: cases.length, tiers }),
    input: { n: cases.length, tiers },
    output: perTier,
    latencyMs: 0,
    ok: true,
    meta: { rowCount: rows.length },
  };
  void writeTrace(evalEvent).catch(() => {});

  return { fn: opts.name, rows, perTier };
}

function defaultEquals<O>(a: O, b: O): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}
