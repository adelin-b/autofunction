# Autoresearch loop

The autoresearch loop turns the JSONL trace store into a feedback signal for prompt + code improvements.

## The loop

```
1. Run baseline eval (evalSet)        → traces/*.jsonl
2. Inspect traces for failures        → src/db.ts / npm run traces:query
3. Identify the pattern that breaks   → manual or Claude-driven
4. Propose a fix (prompt change OR
   shadow-code implementation)        → new version-suffixed function
5. Re-run eval against the same cases → traces/*.jsonl (variant=shadow-eval)
6. Compare matchRate per tier         → ship V2 only if uplift on the cheap tier
```

The loop is intentionally cheap on Haiku — the smart-tier exists only as a baseline + judge for hard cases.

## G007 demonstration

`examples/autoresearch.ts` runs the loop end-to-end on a regulator-action adversarial set, where the expected label requires recognising the **primary actor** rather than the **topical surface**.

### Baseline prompt

```
Classify the dominant theme of the following text.
```

### V2 prompt (frame-disambiguation rules)

```
Classify the dominant theme of the following news headline.
Rules:
1. The dominant theme is the one matching the PRIMARY ACTOR + ACTION in the headline.
2. "Senate / Congress / regulator votes / bans / passes X" → politics, regardless of X.
3. "FDA / WHO approves / warns about X" → health.
4. "Earnings / stocks / market / Fed signals" → finance.
5. "League / team / player / match / strike in sports context" → sports.
6. Ignore secondary topics in subordinate clauses — only the primary frame counts.
```

### Cases (regulator-action set)

| Case | Expected | Baseline got | V2 got |
|------|----------|--------------|--------|
| "Meta hit with €1.2B EU privacy fine over data transfer rules." | politics | finance | _see traces_ |
| "FDA halts trial of OpenAI's medical diagnostics tool over safety concerns." | politics | health | _see traces_ |
| "Senate hearing grills Apple executives over App Store fee structure." | politics | tech | _see traces_ |
| "CFTC files lawsuit against crypto exchange for unregistered derivatives sales." | politics | finance | _see traces_ |

### Result on claude-haiku-4-5

| Variant | matchRate | avg latency |
|---------|-----------|-------------|
| baseline | **0.00** (0/4) | 14.6s |
| V2 frame rules | **0.25** (1/4) | 11.1s |
| Δ | **+0.25** | -3.5s |

Uplift confirmed. The V2 prompt is also faster on average — fewer tokens of reasoning since the rules pre-collapse the decision tree.

Haiku still misses 3/4 with V2, which is the **next** autoresearch iteration:
- Either tighten the rules further (e.g. inject few-shot examples of regulator-action headlines),
- Or pair the cheap call with a deterministic shadow-code classifier that catches regulator-name keywords ("FDA / CFTC / SEC / Senate / Congress / EU Commission / Court") and overrides the AI label.

## Adding new loops

1. Write or update an example script in `examples/`.
2. Run it — every call appends to `traces/<YYYY-MM-DD>.jsonl`.
3. Query the traces with `npm run traces:query`.
4. Open a PR with the baseline-vs-improved matchRate delta in the description.
