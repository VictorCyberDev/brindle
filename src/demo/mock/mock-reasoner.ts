import type { z } from "zod";
import {
  parseReasoningOutput,
  type NemotronReasoner,
  type ReasoningRequest,
  type ReasoningResult,
} from "../../integrations/nemotron";

export const MOCK_MODEL_ID = "MOCK:deterministic-reasoner";

/** What a mock is told about the call, so tests can make it misbehave on purpose. */
export interface MockCall {
  actor: string;
  input: Record<string, unknown>;
  /** The well-behaved proposal the mock would return. */
  defaultOutput: Record<string, unknown>;
}

/**
 * MOCK. NOT NEMOTRON. A deterministic stand-in that always proposes the
 * "happy" decision, citing evidence it was shown. `override` lets tests inject
 * hostile or malformed output. Output still passes through the real schema gate.
 */
export class MockDeterministicReasoner implements NemotronReasoner {
  readonly calls: MockCall[] = [];

  constructor(private readonly override?: (call: MockCall) => unknown) {}

  reason<S extends z.ZodType>(request: ReasoningRequest<S>): Promise<ReasoningResult<z.output<S>>> {
    const input = request.meta.input;
    const evidence = (input.evidence as { evidenceId: string }[]) ?? [];
    const allowed = (input.allowedDecisions as string[]) ?? [];
    const defaultOutput = {
      decision: allowed[0],
      target: input.target,
      rationale: {
        summary: `MOCK rationale for ${String(input.actor)}`,
        factors: [
          {
            factor: "mock: evidence reviewed",
            evidenceIds: evidence.slice(0, 2).map((e) => e.evidenceId),
          },
        ],
      },
      confidence: 0.9,
    };
    const call: MockCall = { actor: String(input.actor), input, defaultOutput };
    this.calls.push(call);
    const raw = this.override ? this.override(call) : defaultOutput;
    return Promise.resolve({
      output: parseReasoningOutput(request.outputSchema, raw),
      modelId: MOCK_MODEL_ID,
      traceId: request.meta.traceId,
      provider: "MOCK",
      providerRequestId: null,
    });
  }
}
