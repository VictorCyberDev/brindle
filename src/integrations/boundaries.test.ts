import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import {
  METERLESS_OPERATIONS,
  createUnavailableMeterlessClient,
  type MeterlessClient,
  modelInvocationSchema,
} from "./meterless";
import {
  NEMOTRON_OPERATIONS,
  ReasoningOutputInvalidError,
  createUnavailableNemotronReasoner,
  parseReasoningOutput,
  reasoningRequestMetaSchema,
  type NemotronReasoner,
} from "./nemotron";
import { IntegrationNotAvailableError } from "./errors";
import {
  ZETARIS_OPERATIONS,
  createUnavailableZetarisReader,
  type ZetarisTruthReader,
} from "./zetaris";

// Anything that could change business state or run arbitrary work.
const PROHIBITED =
  /^(write|insert|update|delete|remove|upsert|create|put|patch|drop|set|execute|exec|run|call|invoke(?!Model$)|mutate|sql|query|tool)/i;

// Compile-time: the declared operation list is exactly the interface surface.
expectTypeOf<keyof ZetarisTruthReader>().toEqualTypeOf<(typeof ZETARIS_OPERATIONS)[number]>();
expectTypeOf<keyof NemotronReasoner>().toEqualTypeOf<(typeof NEMOTRON_OPERATIONS)[number]>();
expectTypeOf<keyof MeterlessClient>().toEqualTypeOf<(typeof METERLESS_OPERATIONS)[number]>();

describe("sponsor adapter surfaces", () => {
  it("Zetaris is read-only", () => {
    expect([...ZETARIS_OPERATIONS]).toEqual(["readAssertions"]);
    const reader = createUnavailableZetarisReader("test");
    expect(Object.keys(reader)).toEqual(["readAssertions"]);
    for (const key of Object.keys(reader)) expect(key).not.toMatch(PROHIBITED);
  });

  it("Nemotron exposes reasoning only: no tools, no execution", () => {
    expect([...NEMOTRON_OPERATIONS]).toEqual(["reason"]);
    expect(Object.keys(createUnavailableNemotronReasoner("test"))).toEqual(["reason"]);
    const meta = {
      task: "MATERIALITY",
      promptVersion: "p1",
      schemaVersion: "s1",
      traceId: "t",
      input: {},
    };
    expect(reasoningRequestMetaSchema.safeParse(meta).success).toBe(true);
    expect(reasoningRequestMetaSchema.safeParse({ ...meta, tools: [{ name: "x" }] }).success).toBe(
      false,
    );
    expect(reasoningRequestMetaSchema.safeParse({ ...meta, task: "EXECUTE" }).success).toBe(false);
  });

  it("Meterless is limited to model invocation and recovery memory", () => {
    expect([...METERLESS_OPERATIONS]).toEqual(["invokeModel", "remember", "recall"]);
    const client = createUnavailableMeterlessClient("test");
    expect(Object.keys(client).sort()).toEqual([...METERLESS_OPERATIONS].sort());
    for (const key of Object.keys(client)) expect(key).not.toMatch(PROHIBITED);
    const invocation = {
      modelId: "m",
      traceId: "t",
      messages: [{ role: "user", content: "hi" }],
      responseJsonSchema: {},
    };
    expect(modelInvocationSchema.safeParse(invocation).success).toBe(true);
    expect(modelInvocationSchema.safeParse({ ...invocation, tools: [] }).success).toBe(false);
  });

  it("unconfigured adapters fail loudly instead of faking data", async () => {
    const subject = { entityType: "supplier", entityId: "s1" };
    await expect(
      createUnavailableZetarisReader("no creds").readAssertions({ subject }),
    ).rejects.toBeInstanceOf(IntegrationNotAvailableError);
  });

  it("model output must pass its schema before use", () => {
    const schema = z.strictObject({ verdict: z.enum(["SAME", "CHANGED", "UNCERTAIN"]) });
    expect(parseReasoningOutput(schema, { verdict: "UNCERTAIN" })).toEqual({
      verdict: "UNCERTAIN",
    });
    expect(() => parseReasoningOutput(schema, { verdict: "PROBABLY_SAME" })).toThrow(
      ReasoningOutputInvalidError,
    );
    expect(() => parseReasoningOutput(schema, { verdict: "SAME", runShell: "rm -rf" })).toThrow(
      ReasoningOutputInvalidError,
    );
  });
});
