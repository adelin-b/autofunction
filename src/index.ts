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
export { openclaw, MODEL_SMART, MODEL_CHEAP, pickModel } from "./provider.js";
export type { Tier } from "./provider.js";
export { writeTrace, newTraceId, hashInput } from "./trace.js";
export type { TraceEvent } from "./trace.js";
