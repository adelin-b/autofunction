export { z } from "zod";
export type { LanguageModel } from "ai";

export { autoFunction } from "./autoFunction.js";
export type {
  AutoFunctionOpts,
  AutoFunctionResult,
  Tier,
} from "./autoFunction.js";

export { withShadow } from "./shadow.js";
export type { ShadowMode, ShadowOpts, ShadowResult } from "./shadow.js";

export { evalSet } from "./eval.js";
export type {
  EvalCase,
  EvalRow,
  EvalReport,
  EvalRollup,
  EvalOpts,
} from "./eval.js";

export { claudeP } from "./claudeP.js";
export type { ClaudePOpts } from "./claudeP.js";

export { openTraces, summary } from "./db.js";
