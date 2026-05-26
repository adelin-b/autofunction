import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("withShadow", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "autofn-shadow-"));
    process.env.AUTOFN_TRACES_DIR = dir;
  });

  it("returns AI output in log-only mode and flags divergence", async () => {
    const { withShadow } = await import("../src/shadow.js");
    const fn = withShadow<string, string>(
      async (i) => ({ output: `ai:${i}`, traceId: "trace-ai" }),
      (i) => `shadow:${i}`,
      { name: "f", mode: "log-only" }
    );
    const res = await fn("x");
    expect(res.output).toBe("ai:x");
    expect(res.source).toBe("ai");
    expect(res.diverged).toBe(true);
    rmSync(dir, { recursive: true, force: true });
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
    rmSync(dir, { recursive: true, force: true });
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
    rmSync(dir, { recursive: true, force: true });
  });
});
