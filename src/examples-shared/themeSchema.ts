import { z } from "zod";

/**
 * Shared schema for the `detectTheme` example surface. Lives in `src/` so all
 * examples (single-call, shadow, eval, autoresearch) import the exact same
 * Zod shape — keeps the example demos honest when comparing tiers.
 */
export const ThemeSchema = z.object({
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

export type Theme = z.infer<typeof ThemeSchema>;
