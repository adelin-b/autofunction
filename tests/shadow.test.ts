import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("withShadow", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "autofn-shadow-"));
    process.env.AUTOFN_TRACES_DIR = dir;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns AI output in compare mode and flags divergence", async () => {
    const { withShadow } = await import("../src/shadow.js");
    const fn = withShadow<string, string>(
      async (i) => ({ output: `ai:${i}`, traceId: "trace-ai" }),
      (i) => `shadow:${i}`,
      { name: "f", mode: "compare" }
    );
    const res = await fn("x");
    expect(res.output).toBe("ai:x");
    expect(res.source).toBe("ai");
    expect(res.diverged).toBe(true);
    expect(res.aiTraceId).toBe("trace-ai");
    expect(typeof res.shadowTraceId).toBe("string");
  });

  it("prefers shadow when mode=prefer-shadow", async () => {
    const { withShadow } = await import("../src/shadow.js");
    const fn = withShadow<string, string>(
      async (i) => ({ output: `ai:${i}`, traceId: "t" }),
      (i) => `shadow:${i}`,
      { name: "f", mode: "prefer-shadow" }
    );
    const res = await fn("y");
    expect(res.output).toBe("shadow:y");
    expect(res.source).toBe("shadow");
  });

  it("non-diverged when equals returns true", async () => {
    const { withShadow } = await import("../src/shadow.js");
    const fn = withShadow<string, { v: number }>(
      async () => ({ output: { v: 1 }, traceId: "t" }),
      () => ({ v: 1 }),
      { name: "f", equals: (a, b) => a.v === b.v }
    );
    const res = await fn("z");
    expect(res.diverged).toBe(false);
  });

  it("mode=ai skips the shadow side entirely", async () => {
    const { withShadow } = await import("../src/shadow.js");
    let shadowRan = false;
    const fn = withShadow<string, string>(
      async (i) => ({ output: `ai:${i}`, traceId: "t" }),
      (i) => {
        shadowRan = true;
        return `shadow:${i}`;
      },
      { name: "f", mode: "ai" }
    );
    const res = await fn("k");
    expect(res.output).toBe("ai:k");
    expect(res.source).toBe("ai");
    expect(res.diverged).toBe(false);
    expect(res.shadowTraceId).toBeUndefined();
    expect(shadowRan).toBe(false);
  });

  it("mode=shadow skips the AI side entirely", async () => {
    const { withShadow } = await import("../src/shadow.js");
    let aiRan = false;
    const fn = withShadow<string, string>(
      async (i) => {
        aiRan = true;
        return { output: `ai:${i}`, traceId: "t" };
      },
      (i) => `shadow:${i}`,
      { name: "f", mode: "shadow" }
    );
    const res = await fn("q");
    expect(res.output).toBe("shadow:q");
    expect(res.source).toBe("shadow");
    expect(res.aiTraceId).toBeUndefined();
    expect(aiRan).toBe(false);
  });
});
