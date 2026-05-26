import { appendFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export type TraceEvent = {
  id: string;
  ts: string;
  fn: string;
  variant: "ai" | "shadow-code" | "shadow-eval";
  tier?: "smart" | "cheap";
  model?: string;
  inputHash: string;
  input: unknown;
  output: unknown;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs: number;
  ok: boolean;
  errorKind?: string;
  errorMessage?: string;
  meta?: Record<string, unknown>;
};

const TRACES_DIR = process.env.AUTOFN_TRACES_DIR ?? "./traces";

function dayFile(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return join(TRACES_DIR, `${y}-${m}-${day}.jsonl`);
}

async function ensureDir(): Promise<void> {
  if (!existsSync(TRACES_DIR)) {
    await mkdir(TRACES_DIR, { recursive: true });
  }
}

export async function writeTrace(event: TraceEvent): Promise<void> {
  await ensureDir();
  await appendFile(dayFile(), JSON.stringify(event) + "\n", "utf8");
}

export function newTraceId(): string {
  return randomUUID();
}

export function hashInput(input: unknown): string {
  const s = typeof input === "string" ? input : JSON.stringify(input);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}
