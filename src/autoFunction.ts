import { generateObject, generateText } from "ai";
import { z, type ZodSchema } from "zod";
import { openclaw, pickModel, type Tier } from "./provider.js";
import { writeTrace, newTraceId, hashInput, type TraceEvent } from "./trace.js";

export type AutoFunctionOpts<O> = {
  name: string;
  tier?: Tier;
  schema?: ZodSchema<O>;
  temperature?: number;
  systemPrompt?: string;
};

export type AutoFunctionResult<O> = {
  output: O;
  traceId: string;
  latencyMs: number;
  model: string;
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

  const userPrompt = renderPrompt(promptTemplate, input);

  let output: O;
  let ok = true;
  let errorKind: string | undefined;
  let errorMessage: string | undefined;
  let promptTokens: number | undefined;
  let completionTokens: number | undefined;

  try {
    if (opts.schema) {
      const res = await generateObject({
        model: openclaw(model),
        schema: opts.schema,
        system: opts.systemPrompt,
        prompt: userPrompt,
        temperature: opts.temperature ?? 0,
      });
      output = res.object as O;
      promptTokens = res.usage?.promptTokens;
      completionTokens = res.usage?.completionTokens;
    } else {
      const res = await generateText({
        model: openclaw(model),
        system: opts.systemPrompt,
        prompt: userPrompt,
        temperature: opts.temperature ?? 0,
      });
      output = res.text as unknown as O;
      promptTokens = res.usage?.promptTokens;
      completionTokens = res.usage?.completionTokens;
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
      promptTokens,
      completionTokens,
      latencyMs: Date.now() - started,
      ok,
      errorKind,
      errorMessage,
    };
    // Fire-and-forget; failure to persist a trace must not break the call.
    void writeTrace(event).catch(() => {});
  }

  return {
    output: output!,
    traceId,
    latencyMs: Date.now() - started,
    model,
  };
}

function renderPrompt(template: string, input: unknown): string {
  const inputStr = typeof input === "string" ? input : JSON.stringify(input, null, 2);
  if (template.includes("{{input}}")) return template.replaceAll("{{input}}", inputStr);
  return `${template}\n\n${inputStr}`;
}

export { z };
