import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2Content,
  LanguageModelV2FinishReason,
  LanguageModelV2Usage,
} from "@ai-sdk/provider";

type FakeOpts = {
  text: string;
  finishReason?: LanguageModelV2FinishReason;
  usage?: LanguageModelV2Usage;
  provider?: string;
  modelId?: string;
};

function fakeModel(o: FakeOpts): LanguageModelV2 {
  const usage: LanguageModelV2Usage = o.usage ?? {
    inputTokens: 10,
    outputTokens: 5,
    totalTokens: 15,
  };
  return {
    specificationVersion: "v2",
    provider: o.provider ?? "fake",
    modelId: o.modelId ?? "fake-1",
    supportedUrls: {},
    async doGenerate(
      _opts: LanguageModelV2CallOptions
    ): Promise<{
      content: Array<LanguageModelV2Content>;
      finishReason: LanguageModelV2FinishReason;
      usage: LanguageModelV2Usage;
      warnings: [];
    }> {
      return {
        content: [{ type: "text", text: o.text }],
        finishReason: o.finishReason ?? "stop",
        usage,
        warnings: [],
      };
    },
    async doStream(): Promise<never> {
      throw new Error("fake: stream not implemented");
    },
  };
}

describe("autoFunction", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "autofn-af-"));
    process.env.AUTOFN_TRACES_DIR = dir;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns text output when no schema is provided", async () => {
    const { autoFunction } = await import("../src/autoFunction.js");
    const res = await autoFunction("say hi", "", {
      name: "hi",
      model: fakeModel({ text: "hello world", modelId: "fake-haiku" }),
    });
    expect(res.output).toBe("hello world");
    expect(res.model).toBe("fake-haiku");
    expect(res.provider).toBe("fake");
    expect(res.usage.inputTokens).toBe(10);
    expect(res.usage.outputTokens).toBe(5);
    expect(res.finishReason).toBe("stop");

    const lines = readFileSync(
      join(dir, readdirSync(dir).find((f) => f.endsWith(".jsonl"))!),
      "utf8"
    )
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    const last = lines[lines.length - 1];
    expect(last.ok).toBe(true);
    expect(last.provider).toBe("fake");
    expect(last.model).toBe("fake-haiku");
    expect(last.inputTokens).toBe(10);
    expect(last.outputTokens).toBe(5);
  });

  it("parses + validates JSON via zod when schema is provided", async () => {
    const { autoFunction } = await import("../src/autoFunction.js");
    const { z } = await import("zod");
    const schema = z.object({ n: z.number(), label: z.string() });
    const res = await autoFunction("ignored", "", {
      name: "structured",
      model: fakeModel({ text: '{"n": 42, "label": "ok"}' }),
      schema,
    });
    expect(res.output).toEqual({ n: 42, label: "ok" });
  });

  it("traces ok=false and rethrows when output violates the schema", async () => {
    const { autoFunction } = await import("../src/autoFunction.js");
    const { z } = await import("zod");
    const schema = z.object({ n: z.number() });
    await expect(
      autoFunction("ignored", "", {
        name: "bad-schema",
        model: fakeModel({ text: '{"n": "not-a-number"}' }),
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
    expect(last.errorKind).toMatch(/Error/);
  });

  it("resolves the right tier when `models` + `tier` are passed", async () => {
    const { autoFunction } = await import("../src/autoFunction.js");
    const res = await autoFunction("ignored", "", {
      name: "tiered",
      models: {
        cheap: fakeModel({ text: "cheap-said", modelId: "fake-haiku" }),
        smart: fakeModel({ text: "smart-said", modelId: "fake-sonnet" }),
      },
      tier: "smart",
    });
    expect(res.output).toBe("smart-said");
    expect(res.model).toBe("fake-sonnet");
  });

  it("defaults to `cheap` tier when `tier` is omitted and key is present", async () => {
    const { autoFunction } = await import("../src/autoFunction.js");
    const res = await autoFunction("ignored", "", {
      name: "tiered-default",
      models: {
        cheap: fakeModel({ text: "cheap!", modelId: "fake-haiku" }),
        smart: fakeModel({ text: "smart!", modelId: "fake-sonnet" }),
      },
    });
    expect(res.output).toBe("cheap!");
  });
});
