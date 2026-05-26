import { z, type ZodSchema } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { pickModel, runClaudeP, type Tier } from "./provider.js";
import { writeTrace, newTraceId, hashInput, type TraceEvent } from "./trace.js";

export type AutoFunctionOpts<O> = {
  name: string;
  tier?: Tier;
  schema?: ZodSchema<O>;
  systemPrompt?: string;
};

export type AutoFunctionResult<O> = {
  output: O;
  traceId: string;
  latencyMs: number;
  model: string;
  costUsd: number;
};

export async function autoFunction<I, O = string>(
  promptTemplate: string,
  input: I,
  opts: AutoFunctionOpts<O>
): Promise<AutoFunctionResult<O>> {
  const tier: Tier = opts.tier ?? "smart";
  const model = pickModel(tier);
  const traceId = newTraceId();
  const started = Date.now();

  const jsonSchema = opts.schema ? zodToJsonSchema(opts.schema, "Output") : undefined;
  const userPrompt = renderPrompt(promptTemplate, input, jsonSchema);

  let output: O;
  let ok = true;
  let errorKind: string | undefined;
  let errorMessage: string | undefined;
  let costUsd = 0;
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;

  try {
    const res = await runClaudeP({
      model,
      prompt: userPrompt,
      systemPrompt: opts.systemPrompt,
      jsonSchema,
    });
    costUsd = res.costUsd;
    inputTokens = res.inputTokens;
    outputTokens = res.outputTokens;

    if (!res.ok) {
      throw new Error(`claude -p reported error: ${res.result}`);
    }

    if (opts.schema) {
      const parsed = extractJson(res.result);
      output = opts.schema.parse(parsed) as O;
    } else {
      output = res.result as unknown as O;
    }
  } catch (e: unknown) {
    ok = false;
    errorKind = e instanceof Error ? e.name : "unknown";
    errorMessage = e instanceof Error ? e.message : String(e);
    throw e;
  } finally {
    const event: TraceEvent = {
      id: traceId,
      ts: new Date().toISOString(),
      fn: opts.name,
      variant: "ai",
      tier,
      model,
      inputHash: hashInput(input),
      input,
      output: ok ? (output! as unknown) : null,
      promptTokens: inputTokens,
      completionTokens: outputTokens,
      latencyMs: Date.now() - started,
      ok,
      errorKind,
      errorMessage,
      meta: { costUsd },
    };
    // Awaited so consumers (and tests) see the trace before the call returns;
    // errors are swallowed because trace persistence must not break the call.
    await writeTrace(event).catch(() => {});
  }

  return {
    output: output!,
    traceId,
    latencyMs: Date.now() - started,
    model,
    costUsd,
  };
}

function renderPrompt(template: string, input: unknown, schema?: unknown): string {
  const inputStr = typeof input === "string" ? input : JSON.stringify(input, null, 2);
  let prompt = template.includes("{{input}}")
    ? template.replaceAll("{{input}}", inputStr)
    : `${template}\n\n${inputStr}`;
  if (schema) {
    prompt += `\n\nRespond with a single JSON object that conforms to this schema. No prose, no markdown code fences, no explanations — output only the JSON object.\n\nSchema:\n${JSON.stringify(schema)}`;
  }
  return prompt;
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  // Happy path: response is already a JSON object.
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return JSON.parse(trimmed);
  }
  // Fallback: pull the largest balanced JSON object from prose.
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1));
  }
  throw new Error(`No JSON object found in claude -p result: ${trimmed.slice(0, 200)}`);
}

export { z };
