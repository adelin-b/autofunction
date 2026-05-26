import "dotenv/config";
import { autoFunction } from "../src/index.js";

async function smoke() {
  const prompt = "Reply with exactly the single word 'pong' and nothing else.";

  const cheap = await autoFunction(prompt, "", { name: "smoke", tier: "cheap" });
  console.log(
    JSON.stringify(
      {
        tier: "cheap",
        model: cheap.model,
        output: cheap.output,
        latencyMs: cheap.latencyMs,
        costUsd: cheap.costUsd,
        traceId: cheap.traceId,
      },
      null,
      2
    )
  );

  const smart = await autoFunction(prompt, "", { name: "smoke", tier: "smart" });
  console.log(
    JSON.stringify(
      {
        tier: "smart",
        model: smart.model,
        output: smart.output,
        latencyMs: smart.latencyMs,
        costUsd: smart.costUsd,
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
