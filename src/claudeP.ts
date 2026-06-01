import { spawn } from "node:child_process";
import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2Content,
  LanguageModelV2FinishReason,
  LanguageModelV2Prompt,
  LanguageModelV2Usage,
} from "@ai-sdk/provider";

export type ClaudePOpts = {
  /** Model id forwarded to `claude -p --model` (e.g. "claude-haiku-4-5"). */
  model: string;
  /** Path to the `claude` binary. Defaults to "claude" on PATH. */
  bin?: string;
};

const PROVIDER_NAME = "autofunction-claude-p";

/**
 * Build a `LanguageModelV2` that shells out to the Claude Code CLI
 * (`claude -p --output-format json`) for each generation.
 *
 * Drop-in for any Vercel AI SDK helper that accepts a `LanguageModel`
 * (`generateText`, `generateObject`, …) — but **streaming is not supported**;
 * `doStream` throws.
 *
 * Auth: whatever the local `claude` binary is logged in with
 * (`claude /login` OAuth, or `ANTHROPIC_API_KEY` in your shell env).
 */
export function claudeP(opts: ClaudePOpts): LanguageModelV2 {
  const bin = opts.bin ?? process.env.AUTOFN_CLAUDE_BIN ?? "claude";
  const modelId = opts.model;

  return {
    specificationVersion: "v2",
    provider: PROVIDER_NAME,
    modelId,
    supportedUrls: {},

    async doGenerate(
      callOpts: LanguageModelV2CallOptions
    ): Promise<{
      content: Array<LanguageModelV2Content>;
      finishReason: LanguageModelV2FinishReason;
      usage: LanguageModelV2Usage;
      providerMetadata: Record<string, Record<string, number | string>>;
      warnings: [];
    }> {
      const { systemText, userText } = flattenPrompt(callOpts.prompt);
      const raw = await runClaudeP({
        bin,
        model: modelId,
        prompt: userText,
        systemPrompt: systemText,
        signal: callOpts.abortSignal,
      });

      const finishReason: LanguageModelV2FinishReason = raw.ok
        ? "stop"
        : "error";

      const inputTokens = raw.inputTokens || undefined;
      const outputTokens = raw.outputTokens || undefined;
      const totalTokens =
        inputTokens !== undefined && outputTokens !== undefined
          ? inputTokens + outputTokens
          : undefined;

      // Surface `claude -p`'s reported USD cost via providerMetadata under
      // our namespace so autoFunction can plumb it into trace.costUsd.
      return {
        content: [{ type: "text", text: raw.result }],
        finishReason,
        usage: {
          inputTokens,
          outputTokens,
          totalTokens,
        },
        providerMetadata: {
          [PROVIDER_NAME]: {
            costUsd: raw.costUsd,
            sessionId: raw.sessionId,
            durationMs: raw.durationMs,
            cacheReadInputTokens: raw.cacheReadInputTokens,
            cacheCreationInputTokens: raw.cacheCreationInputTokens,
          },
        },
        warnings: [],
      };
    },

    async doStream(): Promise<never> {
      throw new Error(
        "claudeP: streaming is not supported. Use generateText / generateObject (doGenerate)."
      );
    },
  };
}

/**
 * Flatten an ai-sdk `LanguageModelV2Prompt` (array of messages with structured
 * content parts) down to a `{ system, user }` string pair suitable for
 * `claude -p`'s flat command-line interface.
 *
 * Strategy:
 *   - All system messages are concatenated into `systemText`.
 *   - All non-system messages are concatenated into `userText`, prefixed with
 *     the role for assistant/tool turns so multi-turn context is preserved.
 *   - Only text content parts are passed through; non-text parts (file,
 *     image, tool-call, tool-result, reasoning) are stringified to a
 *     placeholder so they don't silently disappear.
 */
function flattenPrompt(prompt: LanguageModelV2Prompt): {
  systemText: string | undefined;
  userText: string;
} {
  const systemParts: string[] = [];
  const userParts: string[] = [];

  for (const msg of prompt) {
    if (msg.role === "system") {
      systemParts.push(msg.content);
      continue;
    }

    const text = extractText(msg.content);
    if (msg.role === "user") {
      userParts.push(text);
    } else if (msg.role === "assistant") {
      userParts.push(`Assistant (previous turn):\n${text}`);
    } else if (msg.role === "tool") {
      userParts.push(`Tool result:\n${text}`);
    }
  }

  return {
    systemText: systemParts.length > 0 ? systemParts.join("\n\n") : undefined,
    userText: userParts.join("\n\n"),
  };
}

type StructuredContent = LanguageModelV2Prompt[number]["content"];

function extractText(content: string | StructuredContent): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const out: string[] = [];
  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    const type = (part as { type: string }).type;
    if (type === "text") {
      out.push((part as { text: string }).text);
    } else if (type === "tool-call") {
      const p = part as { toolName: string; input: unknown };
      out.push(`[tool-call ${p.toolName}: ${JSON.stringify(p.input)}]`);
    } else if (type === "tool-result") {
      const p = part as { toolName: string; output: unknown };
      out.push(`[tool-result ${p.toolName}: ${JSON.stringify(p.output)}]`);
    } else if (type === "reasoning") {
      out.push(`[reasoning omitted]`);
    } else {
      out.push(`[${type} part omitted]`);
    }
  }
  return out.join("\n");
}

// ───────────────────────────── claude -p driver ─────────────────────────────

export type ClaudePRawResult = {
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
  bin: string;
  model: string;
  prompt: string;
  systemPrompt?: string;
  signal?: AbortSignal;
};

export function runClaudeP(opts: RunClaudePOpts): Promise<ClaudePRawResult> {
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

  return new Promise<ClaudePRawResult>((resolve, reject) => {
    const child = spawn(opts.bin, args, {
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
        const parsed = JSON.parse(stdout.trim()) as Record<string, unknown>;
        const usage = (parsed.usage ?? {}) as Record<string, unknown>;
        resolve({
          result: String(parsed.result ?? ""),
          ok: parsed.is_error === false,
          durationMs: Number(parsed.duration_ms ?? 0),
          costUsd: Number(parsed.total_cost_usd ?? 0),
          inputTokens: Number(usage.input_tokens ?? 0),
          outputTokens: Number(usage.output_tokens ?? 0),
          cacheReadInputTokens: Number(usage.cache_read_input_tokens ?? 0),
          cacheCreationInputTokens: Number(
            usage.cache_creation_input_tokens ?? 0
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

export const _internal = { flattenPrompt, runClaudeP };
