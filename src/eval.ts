import type { LanguageModel } from "ai";
import type { ZodSchema } from "zod";
import { autoFunction, type AutoFunctionResult } from "./autoFunction.js";
import { writeTrace, newTraceId, hashInput, type TraceEvent } from "./trace.js";

export type EvalCase<I, O> = {
  input: I;
  expected?: O;
};

export type EvalRow<O> = {
  caseIdx: number;
  tier: string;
  model: string;
  provider: string;
  output: O;
  latencyMs: number;
  matchesExpected?: boolean;
};

export type EvalRollup = {
  n: number;
  avgLatencyMs: number;
  matchRate?: number;
};

export type EvalReport<O> = {
  fn: string;
  rows: EvalRow<O>[];
  perTier: Record<string, EvalRollup>;
};

export type EvalOpts<O> = {
  name: string;
  promptTemplate: string;
  /**
   * Tier → model bag. One eval row is produced per `(case, tier)` pair.
   * Keys are free-form labels (commonly `"cheap"` / `"smart"`).
   */
  tiers: Record<string, LanguageModel>;
  schema?: ZodSchema<O>;
  equals?: (a: O, b: O) => boolean;
};

export async function evalSet<I, O>(
  cases: EvalCase<I, O>[],
  opts: EvalOpts<O>
): Promise<EvalReport<O>> {
  const tierEntries = Object.entries(opts.tiers);
  if (tierEntries.length === 0) {
    throw new Error("evalSet: `tiers` is empty.");
  }
  const eq = opts.equals ?? defaultEquals<O>;
  const rows: EvalRow<O>[] = [];

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i]!;
    for (const [tier, model] of tierEntries) {
      const res: AutoFunctionResult<O> = await autoFunction<I, O>(
        opts.promptTemplate,
        c.input,
        {
          name: opts.name,
          model,
          ...(opts.schema ? { schema: opts.schema } : {}),
        }
      );
      const matchesExpected =
        c.expected !== undefined ? eq(res.output, c.expected) : undefined;
      rows.push({
        caseIdx: i,
        tier,
        model: res.model,
        provider: res.provider,
        output: res.output,
        latencyMs: res.latencyMs,
        matchesExpected,
      });
    }
  }

  const perTier: Record<string, EvalRollup> = {};
  for (const [tier] of tierEntries) {
    const tierRows = rows.filter((r) => r.tier === tier);
    const withExpected = tierRows.filter((r) => r.matchesExpected !== undefined);
    const matchRate =
      withExpected.length === 0
        ? undefined
        : withExpected.filter((r) => r.matchesExpected).length /
          withExpected.length;
    perTier[tier] = {
      n: tierRows.length,
      avgLatencyMs:
        tierRows.reduce((a, r) => a + r.latencyMs, 0) /
        Math.max(tierRows.length, 1),
      matchRate,
    };
  }

  const evalTraceId = newTraceId();
  const evalEvent: TraceEvent = {
    id: evalTraceId,
    ts: new Date().toISOString(),
    fn: opts.name,
    variant: "shadow-eval",
    inputHash: hashInput({ n: cases.length, tiers: Object.keys(opts.tiers) }),
    input: { n: cases.length, tiers: Object.keys(opts.tiers) },
    output: perTier,
    latencyMs: 0,
    ok: true,
    meta: { rowCount: rows.length },
  };
  await writeTrace(evalEvent).catch(() => {});

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
