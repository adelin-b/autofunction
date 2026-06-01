import "dotenv/config";
import { anthropic } from "@ai-sdk/anthropic";
import { evalSet } from "../src/index.js";
import { ThemeSchema, type Theme } from "../src/examples-shared/themeSchema.js";

// Adversarial cases chosen so the expected label requires recognising the
// PRIMARY ACTOR (regulator / agency / legislature) over the more obvious
// topical label (tech / health / sports / finance). Without the v2 rules,
// Haiku tends to pick the topic instead of the action frame.
const cases = [
  {
    input: "Meta hit with €1.2B EU privacy fine over data transfer rules.",
    expected: { theme: "politics" as const, confidence: 0.8 },
  },
  {
    input:
      "FDA halts trial of OpenAI's medical diagnostics tool over safety concerns.",
    expected: { theme: "politics" as const, confidence: 0.8 },
  },
  {
    input:
      "Senate hearing grills Apple executives over App Store fee structure.",
    expected: { theme: "politics" as const, confidence: 0.8 },
  },
  {
    input:
      "CFTC files lawsuit against crypto exchange for unregistered derivatives sales.",
    expected: { theme: "politics" as const, confidence: 0.8 },
  },
];

const BASELINE_PROMPT = "Classify the dominant theme of the following text.";

// Hypothesis: forcing the model to disambiguate via the news frame
// (primary actor + verb) shifts edge cases toward the intended label.
const IMPROVED_PROMPT = [
  "Classify the dominant theme of the following news headline.",
  "Rules:",
  "1. The dominant theme is the one matching the PRIMARY ACTOR + ACTION in the headline.",
  '2. "Senate / Congress / regulator votes / bans / passes X" → politics, regardless of X.',
  '3. "FDA / WHO approves / warns about X" → health.',
  '4. "Earnings / stocks / market / Fed signals" → finance.',
  '5. "League / team / player / match / strike in sports context" → sports.',
  "6. Ignore secondary topics in subordinate clauses — only the primary frame counts.",
].join("\n");

async function runEval(label: string, promptTemplate: string) {
  return evalSet<string, Theme>(cases, {
    name: `detectTheme.${label}`,
    promptTemplate,
    schema: ThemeSchema,
    tiers: { cheap: anthropic("claude-haiku-4-5") },
    equals: (a, b) => a.theme === b.theme,
  });
}

async function main() {
  console.log("=== baseline ===");
  const baseline = await runEval("baseline", BASELINE_PROMPT);
  console.log(JSON.stringify(baseline.perTier, null, 2));
  const baselineMisses = baseline.rows
    .filter((r) => r.matchesExpected === false)
    .map((r) => ({
      caseIdx: r.caseIdx,
      input: cases[r.caseIdx]!.input,
      got: r.output,
      expected: cases[r.caseIdx]!.expected,
    }));
  console.log("baseline misses:", JSON.stringify(baselineMisses, null, 2));

  console.log("\n=== improved (frame-based prompt) ===");
  const improved = await runEval("v2", IMPROVED_PROMPT);
  console.log(JSON.stringify(improved.perTier, null, 2));

  const baseRate = baseline.perTier.cheap?.matchRate ?? 0;
  const improvedRate = improved.perTier.cheap?.matchRate ?? 0;
  const delta = improvedRate - baseRate;
  console.log("\n=== autoresearch verdict ===");
  console.log(
    JSON.stringify(
      {
        baselineMatchRate: baseRate,
        improvedMatchRate: improvedRate,
        delta,
        uplift: delta > 0,
        promptDiff:
          "Added frame-disambiguation rules (primary actor + action) covering politics / health / finance / sports edge cases.",
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
