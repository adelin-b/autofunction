import "dotenv/config";
import { evalSet, z } from "../src/index.js";

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
type Theme = z.infer<typeof ThemeSchema>;

const cases = [
  {
    input: "Senate passes new tax bill after months of debate.",
    expected: { theme: "politics" as const, confidence: 0.8 },
  },
  {
    input: "Lakers beat Celtics in overtime thriller.",
    expected: { theme: "sports" as const, confidence: 0.8 },
  },
  {
    input: "Stocks tumble as Fed signals another rate hike.",
    expected: { theme: "finance" as const, confidence: 0.8 },
  },
];

async function main() {
  const report = await evalSet<string, Theme>(cases, {
    name: "detectTheme",
    promptTemplate: "Classify the dominant theme of the following text.",
    schema: ThemeSchema,
    tiers: ["cheap", "smart"],
    equals: (a, b) => a.theme === b.theme,
  });

  console.log(JSON.stringify(report.perTier, null, 2));
  console.log("rows:", report.rows.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
