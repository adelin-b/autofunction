export { autoFunction, z } from "./autoFunction.js";
export type {
  AutoFunctionOpts,
  AutoFunctionResult,
} from "./autoFunction.js";
export { withShadow } from "./shadow.js";
export type { ShadowMode, ShadowOpts, ShadowResult } from "./shadow.js";
export { evalSet } from "./eval.js";
export type { EvalCase, EvalRow, EvalReport, EvalOpts } from "./eval.js";
export { openTraces, summary } from "./db.js";
export { runClaudeP, MODEL_SMART, MODEL_CHEAP, CLAUDE_BIN, pickModel } from "./provider.js";
export type { Tier, ClaudePResult, RunClaudePOpts } from "./provider.js";
export { writeTrace, newTraceId, hashInput } from "./trace.js";
export type { TraceEvent } from "./trace.js";
