import "dotenv/config";
import { anthropic } from "@ai-sdk/anthropic";
import { autoFunction } from "../src/index.js";
import { ThemeSchema } from "../src/examples-shared/themeSchema.js";

async function main() {
  const sample =
    "The new GPU benchmarks show a 40% uplift over last generation, especially in AI training workloads on Linux.";

  const res = await autoFunction(
    "Classify the dominant theme of the following text.",
    sample,
    {
      name: "detectTheme",
      model: anthropic("claude-haiku-4-5"),
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
