import "dotenv/config";
import { anthropic } from "@ai-sdk/anthropic";
import { autoFunction } from "../src/index.js";

async function smoke() {
  const prompt = "Reply with exactly the single word 'pong' and nothing else.";

  const cheap = await autoFunction(prompt, "", {
    name: "smoke",
    model: anthropic("claude-haiku-4-5"),
  });
  console.log(
    JSON.stringify(
      {
        tier: "cheap",
        provider: cheap.provider,
        model: cheap.model,
        output: cheap.output,
        latencyMs: cheap.latencyMs,
        usage: cheap.usage,
        traceId: cheap.traceId,
      },
      null,
      2
    )
  );

  const smart = await autoFunction(prompt, "", {
    name: "smoke",
    model: anthropic("claude-sonnet-4-6"),
  });
  console.log(
    JSON.stringify(
      {
        tier: "smart",
        provider: smart.provider,
        model: smart.model,
        output: smart.output,
        latencyMs: smart.latencyMs,
        usage: smart.usage,
        traceId: smart.traceId,
      },
      null,
      2
    )
  );
}

smoke().catch((e) => {
  console.error(e);
  process.exit(1);
});
