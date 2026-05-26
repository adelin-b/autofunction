import { spawn } from "node:child_process";

export type Tier = "smart" | "cheap";

export const MODEL_SMART = process.env.AUTOFN_MODEL_SMART ?? "claude-sonnet-4-6";
export const MODEL_CHEAP = process.env.AUTOFN_MODEL_CHEAP ?? "claude-haiku-4-5";
export const CLAUDE_BIN = process.env.AUTOFN_CLAUDE_BIN ?? "claude";

export function pickModel(tier: Tier): string {
  return tier === "smart" ? MODEL_SMART : MODEL_CHEAP;
}

export type ClaudePResult = {
  result: string;
  ok: boolean;
  durationMs: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  sessionId: string;
  rawJson: unknown;
};

export type RunClaudePOpts = {
  model: string;
  prompt: string;
  systemPrompt?: string;
  signal?: AbortSignal;
};

export async function runClaudeP(opts: RunClaudePOpts): Promise<ClaudePResult> {
  const args = [
    "-p",
    "--output-format",
    "json",
    "--model",
    opts.model,
    "--disable-slash-commands",
  ];
  if (opts.systemPrompt) {
    args.push("--system-prompt", opts.systemPrompt);
  }
  args.push(opts.prompt);

  return new Promise<ClaudePResult>((resolve, reject) => {
    const child = spawn(CLAUDE_BIN, args, {
      stdio: ["ignore", "pipe", "pipe"],
      signal: opts.signal,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b: Buffer) => (stdout += b.toString("utf8")));
    child.stderr.on("data", (b: Buffer) => (stderr += b.toString("utf8")));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0 && !stdout.trim()) {
        reject(new Error(`claude -p exited ${code}: ${stderr.trim()}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout.trim());
        resolve({
          result: String(parsed.result ?? ""),
          ok: parsed.is_error === false,
          durationMs: Number(parsed.duration_ms ?? 0),
          costUsd: Number(parsed.total_cost_usd ?? 0),
          inputTokens: Number(parsed.usage?.input_tokens ?? 0),
          outputTokens: Number(parsed.usage?.output_tokens ?? 0),
          cacheReadInputTokens: Number(parsed.usage?.cache_read_input_tokens ?? 0),
          cacheCreationInputTokens: Number(
            parsed.usage?.cache_creation_input_tokens ?? 0
          ),
          sessionId: String(parsed.session_id ?? ""),
          rawJson: parsed,
        });
      } catch (e: unknown) {
        const parseMsg = e instanceof Error ? e.message : String(e);
        reject(
          new Error(
            `claude -p produced non-JSON output (exit ${code}, parse error: ${parseMsg}): ${stdout.slice(0, 500)} | stderr: ${stderr.slice(0, 200)}`
          )
        );
      }
    });
  });
}
