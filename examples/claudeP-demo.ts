import "dotenv/config";
import { autoFunction, claudeP } from "../src/index.js";
import { ThemeSchema } from "../src/examples-shared/themeSchema.js";

/**
 * Demonstrates the built-in `claudeP` adapter. Implements `LanguageModelV2`
 * by shelling out to the Claude Code CLI (`claude -p --output-format json`),
 * so authentication uses whatever the local `claude` binary is already
 * logged in with (OAuth via `claude /login`, or `ANTHROPIC_API_KEY` in env).
 *
 * The same `autoFunction` call site that takes `anthropic("…")` accepts
 * `claudeP({ model: "…" })` with no other changes — that's the whole point
 * of the LanguageModel interface boundary.
 */
async function main() {
  const sample =
    "Senate hearing grills Apple executives over App Store fee structure.";

  const res = await autoFunction(
    "Classify the dominant theme of the following news headline.",
    sample,
    {
      name: "detectTheme.claudeP",
      model: claudeP({ model: "claude-haiku-4-5" }),
      schema: ThemeSchema,
    }
  );

  console.log(
    JSON.stringify(
      {
        provider: res.provider,
        model: res.model,
        latencyMs: res.latencyMs,
        usage: res.usage,
        output: res.output,
        traceId: res.traceId,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
