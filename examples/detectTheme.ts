import "dotenv/config";
import { autoFunction, withShadow, evalSet, z } from "../src/index.js";

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

const PROMPT = "Classify the dominant theme of the following text.";

export async function detectThemeAI(text: string) {
  return autoFunction<string, Theme>(PROMPT, text, {
    name: "detectTheme",
    schema: ThemeSchema,
    tier: "cheap",
  });
}

const KEYWORDS: Record<Theme["theme"], string[]> = {
  tech: ["software", "ai", "code", "computer", "cpu", "gpu", "linux"],
  politics: ["election", "senate", "vote", "government", "law"],
  sports: ["match", "goal", "team", "league", "tournament"],
  finance: ["stock", "market", "investment", "earnings", "ipo"],
  lifestyle: ["recipe", "travel", "fashion", "decor"],
  health: ["symptom", "medicine", "doctor", "fitness", "diet"],
  other: [],
};

function detectThemeShadow(text: string): Theme {
  const lower = text.toLowerCase();
  let best: Theme["theme"] = "other";
  let bestHits = 0;
  for (const [theme, kws] of Object.entries(KEYWORDS) as [Theme["theme"], string[]][]) {
    const hits = kws.filter((k) => lower.includes(k)).length;
    if (hits > bestHits) {
      bestHits = hits;
      best = theme;
    }
  }
  return { theme: best, confidence: bestHits === 0 ? 0.1 : Math.min(0.9, bestHits / 3) };
}

const detectThemeShadowed = withShadow<string, Theme>(
  async (text) => {
    const r = await detectThemeAI(text);
    return { output: r.output, traceId: r.traceId };
  },
  detectThemeShadow,
  {
    name: "detectTheme",
    mode: "log-only",
    equals: (a, b) => a.theme === b.theme,
  }
);

async function main() {
  const sample =
    "The new GPU benchmarks show a 40% uplift over last generation, especially in AI training workloads on Linux.";

  const single = await detectThemeAI(sample);
  console.log("AI:", single.output, `(${single.model}, ${single.latencyMs}ms)`);

  const shadow = await detectThemeShadowed(sample);
  console.log("Shadow check:", shadow);

  const report = await evalSet<string, Theme>(
    [
      { input: "Senate passes new tax bill after months of debate.", expected: { theme: "politics", confidence: 0.8 } },
      { input: "Lakers beat Celtics in overtime thriller.", expected: { theme: "sports", confidence: 0.8 } },
      { input: "Stocks tumble as Fed signals another rate hike.", expected: { theme: "finance", confidence: 0.8 } },
    ],
    {
      name: "detectTheme",
      promptTemplate: PROMPT,
      schema: ThemeSchema,
      tiers: ["cheap", "smart"],
      equals: (a, b) => a.theme === b.theme,
    }
  );
  console.log("Eval per tier:", report.perTier);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
