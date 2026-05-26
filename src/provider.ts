import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const baseURL = process.env.AUTOFN_BASE_URL ?? "http://127.0.0.1:18789/v1";
const apiKey = process.env.AUTOFN_API_KEY;

if (!apiKey) {
  // We don't throw at import time so unit tests can mock the provider, but we
  // warn loudly so real runs surface the missing token immediately.
  // eslint-disable-next-line no-console
  console.warn("[autofunction] AUTOFN_API_KEY not set — provider calls will fail");
}

export const openclaw = createOpenAICompatible({
  name: "openclaw",
  baseURL,
  apiKey: apiKey ?? "missing",
});

export const MODEL_SMART = process.env.AUTOFN_MODEL_SMART ?? "claude-sonnet-4-6";
export const MODEL_CHEAP = process.env.AUTOFN_MODEL_CHEAP ?? "claude-haiku-4-5";

export type Tier = "smart" | "cheap";

export function pickModel(tier: Tier): string {
  return tier === "smart" ? MODEL_SMART : MODEL_CHEAP;
}
