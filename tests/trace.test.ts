import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("trace", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "autofn-"));
    process.env.AUTOFN_TRACES_DIR = dir;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes a JSONL line per event", async () => {
    const { writeTrace, newTraceId, hashInput } = await import("../src/trace.js");
    await writeTrace({
      id: newTraceId(),
      ts: new Date().toISOString(),
      fn: "detectTheme",
      variant: "ai",
      tier: "cheap",
      provider: "anthropic",
      model: "claude-haiku-4-5",
      inputHash: hashInput("hello"),
      input: "hello",
      output: { theme: "other", confidence: 0.1 },
      inputTokens: 12,
      outputTokens: 8,
      finishReason: "stop",
      latencyMs: 12,
      ok: true,
    });
    const files = readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
    expect(files).toHaveLength(1);
    const content = readFileSync(join(dir, files[0]!), "utf8").trim();
    const parsed = JSON.parse(content);
    expect(parsed.fn).toBe("detectTheme");
    expect(parsed.ok).toBe(true);
    expect(parsed.provider).toBe("anthropic");
    expect(parsed.finishReason).toBe("stop");
  });

  it("hashes input deterministically", async () => {
    const { hashInput } = await import("../src/trace.js");
    expect(hashInput("foo")).toBe(hashInput("foo"));
    expect(hashInput({ a: 1 })).toBe(hashInput({ a: 1 }));
    expect(hashInput("foo")).not.toBe(hashInput("bar"));
  });
});
