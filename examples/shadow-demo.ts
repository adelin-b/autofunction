import "dotenv/config";
import { anthropic } from "@ai-sdk/anthropic";
import { autoFunction, withShadow } from "../src/index.js";
import { ThemeSchema, type Theme } from "../src/examples-shared/themeSchema.js";

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
  for (const [theme, kws] of Object.entries(KEYWORDS) as [
    Theme["theme"],
    string[]
  ][]) {
    const hits = kws.filter((k) => lower.includes(k)).length;
    if (hits > bestHits) {
      bestHits = hits;
      best = theme;
    }
  }
  return {
    theme: best,
    confidence: bestHits === 0 ? 0.1 : Math.min(0.9, bestHits / 3),
  };
}

const shadowed = withShadow<string, Theme>(
  async (text) => {
    const r = await autoFunction<string, Theme>(
      "Classify the dominant theme of the following text.",
      text,
      {
        name: "detectTheme",
        model: anthropic("claude-haiku-4-5"),
        schema: ThemeSchema,
      }
    );
    return { output: r.output, traceId: r.traceId };
  },
  detectThemeShadow,
  {
    name: "detectTheme",
    mode: "compare",
    equals: (a, b) => a.theme === b.theme,
  }
);

async function main() {
  const sample =
    "The new GPU benchmarks show a 40% uplift on Linux AI training workloads.";
  const res = await shadowed(sample);
  console.log(JSON.stringify(res, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
