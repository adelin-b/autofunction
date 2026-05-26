import "dotenv/config";
import { autoFunction, z } from "../src/index.js";

const ThemeSchema = z.object({
  theme: z.enum([
    "tech",
    "politics",
    "sports",
    "finance",
    "lifestyle",
    "health",
    "other",
  ]),
  confidence: z.number().min(0).max(1),
});

async function main() {
  const sample =
    "The new GPU benchmarks show a 40% uplift over last generation, especially in AI training workloads on Linux.";

  const res = await autoFunction(
    "Classify the dominant theme of the following text.",
    sample,
    {
      name: "detectTheme",
      schema: ThemeSchema,
      tier: "cheap",
    }
  );
  console.log(
    JSON.stringify(
      {
        model: res.model,
        latencyMs: res.latencyMs,
        costUsd: res.costUsd,
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
