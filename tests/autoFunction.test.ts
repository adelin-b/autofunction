import { describe, it, expect, beforeEach, vi } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("../src/provider.js", async () => {
  const actual = await vi.importActual<typeof import("../src/provider.js")>(
    "../src/provider.js"
  );
  return {
    ...actual,
    runClaudeP: vi.fn(),
  };
});

describe("autoFunction", () => {
  let dir: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "autofn-af-"));
    process.env.AUTOFN_TRACES_DIR = dir;
    const { runClaudeP } = await import("../src/provider.js");
    vi.mocked(runClaudeP).mockReset();
  });

  it("returns text output when no schema is provided", async () => {
    const { autoFunction } = await import("../src/autoFunction.js");
    const { runClaudeP } = await import("../src/provider.js");
    vi.mocked(runClaudeP).mockResolvedValue({
      result: "hello world",
      ok: true,
      durationMs: 42,
      costUsd: 0.001,
      inputTokens: 5,
      outputTokens: 2,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      sessionId: "s1",
      rawJson: {},
    });
    const res = await autoFunction("say hi", "", { name: "hi", tier: "cheap" });
    expect(res.output).toBe("hello world");
    expect(res.model).toBe("claude-haiku-4-5");
    const lines = readFileSync(
      join(dir, readdirSync(dir).find((f) => f.endsWith(".jsonl"))!),
      "utf8"
    )
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(lines[lines.length - 1].ok).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("parses + validates JSON via zod when schema is provided", async () => {
    const { autoFunction } = await import("../src/autoFunction.js");
    const { z } = await import("zod");
    const { runClaudeP } = await import("../src/provider.js");
    vi.mocked(runClaudeP).mockResolvedValue({
      result: '{"n": 42, "label": "ok"}',
      ok: true,
      durationMs: 30,
      costUsd: 0.002,
      inputTokens: 10,
      outputTokens: 8,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      sessionId: "s2",
      rawJson: {},
    });
    const schema = z.object({ n: z.number(), label: z.string() });
    const res = await autoFunction("ignored", "", {
      name: "structured",
      tier: "cheap",
      schema,
    });
    expect(res.output).toEqual({ n: 42, label: "ok" });
    rmSync(dir, { recursive: true, force: true });
  });

  it("traces ok=false and rethrows when output violates the schema", async () => {
    const { autoFunction } = await import("../src/autoFunction.js");
    const { z } = await import("zod");
    const { runClaudeP } = await import("../src/provider.js");
    vi.mocked(runClaudeP).mockResolvedValue({
      result: '{"n": "not-a-number"}',
      ok: true,
      durationMs: 30,
      costUsd: 0.002,
      inputTokens: 10,
      outputTokens: 8,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      sessionId: "s3",
      rawJson: {},
    });
    const schema = z.object({ n: z.number() });
    await expect(
      autoFunction("ignored", "", {
        name: "bad-schema",
        tier: "cheap",
        schema,
      })
    ).rejects.toThrow();
    const lines = readFileSync(
      join(dir, readdirSync(dir).find((f) => f.endsWith(".jsonl"))!),
      "utf8"
    )
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    const last = lines[lines.length - 1];
    expect(last.ok).toBe(false);
    expect(last.errorKind).toMatch(/ZodError|Error/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("traces ok=false when claude -p reports is_error=true", async () => {
    const { autoFunction } = await import("../src/autoFunction.js");
    const { runClaudeP } = await import("../src/provider.js");
    vi.mocked(runClaudeP).mockResolvedValue({
      result: "Not logged in",
      ok: false,
      durationMs: 5,
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      sessionId: "s4",
      rawJson: {},
    });
    await expect(
      autoFunction("test", "", { name: "err", tier: "cheap" })
    ).rejects.toThrow(/Not logged in|claude -p reported error/);
    const lines = readFileSync(
      join(dir, readdirSync(dir).find((f) => f.endsWith(".jsonl"))!),
      "utf8"
    )
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(lines[lines.length - 1].ok).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });
});
