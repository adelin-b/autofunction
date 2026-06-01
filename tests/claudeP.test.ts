import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";

// Capture each spawn() invocation so tests can assert on args + drive stdout.
type FakeSpawnCall = {
  cmd: string;
  args: string[];
  child: FakeChild;
};

class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  kill = vi.fn();
}

const spawnCalls: FakeSpawnCall[] = [];

vi.mock("node:child_process", () => ({
  spawn: vi.fn((cmd: string, args: string[]) => {
    const child = new FakeChild();
    spawnCalls.push({ cmd, args, child });
    return child;
  }),
}));

function emitClose(child: FakeChild, stdoutJson: unknown, code = 0) {
  child.stdout.emit("data", Buffer.from(JSON.stringify(stdoutJson), "utf8"));
  child.emit("close", code);
}

describe("claudeP", () => {
  beforeEach(() => {
    spawnCalls.length = 0;
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("returns a LanguageModelV2-shaped object", async () => {
    const { claudeP } = await import("../src/claudeP.js");
    const model = claudeP({ model: "claude-haiku-4-5" });
    expect(model.specificationVersion).toBe("v2");
    expect(model.provider).toBe("autofunction-claude-p");
    expect(model.modelId).toBe("claude-haiku-4-5");
  });

  it("flattens system + user messages and parses claude -p JSON output", async () => {
    const { claudeP } = await import("../src/claudeP.js");
    const model = claudeP({ model: "claude-haiku-4-5", bin: "/fake/claude" });

    const promise = model.doGenerate({
      prompt: [
        { role: "system", content: "You are concise." },
        {
          role: "user",
          content: [{ type: "text", text: "Say pong." }],
        },
      ],
    } as Parameters<typeof model.doGenerate>[0]);

    expect(spawnCalls).toHaveLength(1);
    const call = spawnCalls[0]!;
    expect(call.cmd).toBe("/fake/claude");
    expect(call.args).toContain("--model");
    expect(call.args[call.args.indexOf("--model") + 1]).toBe(
      "claude-haiku-4-5"
    );
    expect(call.args).toContain("--system-prompt");
    expect(call.args[call.args.indexOf("--system-prompt") + 1]).toBe(
      "You are concise."
    );
    // The prompt itself is the last arg.
    expect(call.args[call.args.length - 1]).toBe("Say pong.");

    emitClose(call.child, {
      result: "pong",
      is_error: false,
      duration_ms: 42,
      total_cost_usd: 0.001,
      usage: { input_tokens: 7, output_tokens: 2 },
      session_id: "s",
    });

    const res = await promise;
    expect(res.content).toEqual([{ type: "text", text: "pong" }]);
    expect(res.finishReason).toBe("stop");
    expect(res.usage.inputTokens).toBe(7);
    expect(res.usage.outputTokens).toBe(2);
    expect(res.usage.totalTokens).toBe(9);
  });

  it("maps is_error=true to finishReason='error'", async () => {
    const { claudeP } = await import("../src/claudeP.js");
    const model = claudeP({ model: "claude-haiku-4-5", bin: "/fake/claude" });

    const promise = model.doGenerate({
      prompt: [
        { role: "user", content: [{ type: "text", text: "anything" }] },
      ],
    } as Parameters<typeof model.doGenerate>[0]);

    const call = spawnCalls[0]!;
    emitClose(call.child, {
      result: "Not logged in",
      is_error: true,
      duration_ms: 5,
      total_cost_usd: 0,
      usage: { input_tokens: 0, output_tokens: 0 },
      session_id: "s",
    });

    const res = await promise;
    expect(res.finishReason).toBe("error");
    expect(res.content).toEqual([{ type: "text", text: "Not logged in" }]);
  });

  it("doStream throws (subprocess streaming is unsupported)", async () => {
    const { claudeP } = await import("../src/claudeP.js");
    const model = claudeP({ model: "claude-haiku-4-5" });
    await expect(
      model.doStream({
        prompt: [
          { role: "user", content: [{ type: "text", text: "x" }] },
        ],
      } as Parameters<typeof model.doStream>[0])
    ).rejects.toThrow(/streaming.*not supported/i);
  });

  it("concatenates multiple system messages and labels assistant/tool turns", async () => {
    const { _internal } = await import("../src/claudeP.js");
    const flat = _internal.flattenPrompt([
      { role: "system", content: "Be terse." },
      { role: "system", content: "No emojis." },
      { role: "user", content: [{ type: "text", text: "Hi" }] },
      {
        role: "assistant",
        content: [{ type: "text", text: "Hello." }],
      },
      { role: "user", content: [{ type: "text", text: "Continue." }] },
    ] as Parameters<typeof _internal.flattenPrompt>[0]);

    expect(flat.systemText).toBe("Be terse.\n\nNo emojis.");
    expect(flat.userText).toContain("Hi");
    expect(flat.userText).toContain("Assistant (previous turn):\nHello.");
    expect(flat.userText).toContain("Continue.");
  });
});
