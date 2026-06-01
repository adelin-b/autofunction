import { appendFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";

export type TraceEvent = {
  id: string;
  ts: string;
  fn: string;
  variant: "ai" | "shadow-code" | "shadow-eval";
  tier?: string;
  /** ai-sdk provider name (e.g. "anthropic", "autofunction-claude-p"). */
  provider?: string;
  /** Provider-specific model id (e.g. "claude-haiku-4-5"). */
  model?: string;
  inputHash: string;
  input: unknown;
  output: unknown;
  /** Input token count as reported by the provider, if any. */
  inputTokens?: number;
  /** Output token count as reported by the provider, if any. */
  outputTokens?: number;
  /**
   * USD cost — only populated by providers that surface it (e.g. the
   * `claudeP` adapter reads `total_cost_usd` from `claude -p`). The Vercel
   * AI SDK does NOT expose cost for most providers; in that case this stays
   * undefined and you must compute it from token counts + a price table or
   * the provider's billing API.
   */
  costUsd?: number;
  /** ai-sdk finish reason for AI calls. */
  finishReason?: string;
  latencyMs: number;
  ok: boolean;
  errorKind?: string;
  errorMessage?: string;
  meta?: Record<string, unknown>;
};

// Resolved per-call so tests that mutate process.env.AUTOFN_TRACES_DIR between
// runs don't get bound to a module-load-time value.
function tracesDir(): string {
  return process.env.AUTOFN_TRACES_DIR ?? "./traces";
}

function dayFile(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return join(tracesDir(), `${y}-${m}-${day}.jsonl`);
}

async function ensureDir(): Promise<void> {
  const dir = tracesDir();
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

// Per-process serialization queue keyed by target file. Two in-flight
// writeTrace calls targeting the same dayfile would otherwise interleave at
// the OS write boundary once their payload crosses PIPE_BUF (~4KB), producing
// torn JSON lines that break `read_json_auto(format='nd', …)` in db.ts.
const writeQueues = new Map<string, Promise<void>>();

export async function writeTrace(event: TraceEvent): Promise<void> {
  await ensureDir();
  const path = dayFile();
  const line = JSON.stringify(event) + "\n";
  const prev = writeQueues.get(path) ?? Promise.resolve();
  const next = prev
    .catch(() => undefined)
    .then(() => appendFile(path, line, "utf8"));
  writeQueues.set(path, next);
  await next;
}

export function newTraceId(): string {
  return randomUUID();
}

export function hashInput(input: unknown): string {
  const s = typeof input === "string" ? input : JSON.stringify(input);
  return createHash("sha256").update(s).digest("hex").slice(0, 16);
}
