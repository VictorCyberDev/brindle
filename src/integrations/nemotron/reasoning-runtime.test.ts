import { describe, expect, it } from "vitest";
import { z } from "zod";
import { json, type Seen } from "../../test-support/protocol-doubles";
import { ReasoningOutputInvalidError } from "./index";
import {
  attributeModel,
  demonstratesNemotron,
  extractJsonObject,
  isMeterlessRouteIdentifier,
  OpenAiCompatibleNemotronReasoner,
  type ReasoningRoute,
  ReasoningProviderError,
} from "./openai-compatible";

/*
 * PROTOCOL TEST DOUBLES for the Meterless Nightshift Runtime and for direct
 * NVIDIA (both OpenAI-compatible). They are not Meterless, not NVIDIA, not
 * Nemotron, and prove nothing about the live services.
 */
const TOKEN = "mt-test-SECRET-DO-NOT-LEAK-111111";
const NV_KEY = "nvapi-test-SECRET-DO-NOT-LEAK-222222";
const schema = z.strictObject({ decision: z.enum(["A", "B"]) });
const meta = {
  task: "DECISION" as const,
  promptVersion: "p",
  schemaVersion: "s",
  traceId: "tr",
  input: { hello: "world" },
};

const meterlessRoute: ReasoningRoute = {
  provider: "meterless",
  baseUrl: "http://localhost:9000",
  runtimeToken: TOKEN,
  runtimeRoute: "meterless/auto",
};
const nvidiaRoute: ReasoningRoute = {
  provider: "nvidia",
  baseUrl: "https://integrate.api.nvidia.com/v1",
  apiKey: NV_KEY,
  modelId: "nvidia/nemotron-test",
};

function make(
  route: ReasoningRoute,
  reportedModel: string | null,
  seen: Seen[] = [],
  status = 200,
) {
  return new OpenAiCompatibleNemotronReasoner({
    route,
    fetch: (async (url: RequestInfo | URL, init?: RequestInit) => {
      seen.push({
        method: init?.method ?? "GET",
        url: String(url),
        headers: new Headers(init?.headers),
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      if (status !== 200) return new Response(`denied ${TOKEN} ${NV_KEY}`, { status });
      if (String(url).endsWith("/models"))
        return json({ data: [{ id: "meterless/auto" }, { id: "nvidia/nemotron-test" }] });
      return json(
        {
          ...(reportedModel === null ? {} : { model: reportedModel }),
          choices: [{ message: { content: '<think>private</think>{"decision":"A"}' } }],
        },
        { headers: { "x-request-id": "req-1" } },
      );
    }) as typeof fetch,
  });
}

describe("Meterless Nightshift Runtime (primary)", () => {
  it("discovers models at GET {base}/v1/models", async () => {
    const seen: Seen[] = [];
    expect(await make(meterlessRoute, null, seen).listModels()).toEqual([
      "meterless/auto",
      "nvidia/nemotron-test",
    ]);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.method).toBe("GET");
    expect(seen[0]!.url).toBe("http://localhost:9000/v1/models");
  });

  it("chats at POST {base}/v1/chat/completions with the Meterless header contract", async () => {
    const seen: Seen[] = [];
    await make(meterlessRoute, "meterless/auto", seen).reason({ meta, outputSchema: schema });
    const req = seen[0]!;
    expect(req.method).toBe("POST");
    expect(req.url).toBe("http://localhost:9000/v1/chat/completions");
    expect(req.headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
    expect(req.headers.get("meterless-app")).toBe("brindle");
    expect(req.headers.get("meterless-scope")).toBe("user");
    expect(req.headers.get("content-type")).toBe("application/json");
    expect(req.headers.get("accept")).toBe("application/json");
    const body = req.body as Record<string, unknown>;
    expect(body).toMatchObject({ model: "meterless/auto", temperature: 0, stream: false });
    for (const forbidden of ["tools", "functions", "tool_choice", "function_call"])
      expect(body).not.toHaveProperty(forbidden);
  });

  it("sends the Meterless headers on model discovery too", async () => {
    const seen: Seen[] = [];
    await make(meterlessRoute, null, seen).listModels();
    expect(seen[0]!.headers.get("meterless-app")).toBe("brindle");
    expect(seen[0]!.headers.get("meterless-scope")).toBe("user");
    expect(seen[0]!.headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
  });
});

describe("direct NVIDIA (secondary)", () => {
  it("never receives Meterless headers, on chat or on model discovery", async () => {
    const seen: Seen[] = [];
    const r = make(nvidiaRoute, "nvidia/nemotron-test", seen);
    await r.listModels();
    await r.reason({ meta, outputSchema: schema });
    expect(seen).toHaveLength(2);
    for (const req of seen) {
      expect(req.headers.get("authorization")).toBe(`Bearer ${NV_KEY}`);
      expect(req.headers.has("meterless-app")).toBe(false);
      expect(req.headers.has("meterless-scope")).toBe(false);
      expect([...req.headers.keys()].some((k) => k.startsWith("meterless"))).toBe(false);
    }
    expect(seen[0]!.url).toBe("https://integrate.api.nvidia.com/v1/models");
    expect(seen[1]!.url).toBe("https://integrate.api.nvidia.com/v1/chat/completions");
  });
});

describe("runtime route is not underlying-model proof", () => {
  it("treats Meterless routing identifiers as routes, never as models", () => {
    for (const id of ["meterless/auto", "meterless/fast", "meterless", "Meterless/Balanced"]) {
      expect(isMeterlessRouteIdentifier(id, "meterless/auto")).toBe(true);
    }
    expect(isMeterlessRouteIdentifier("my-lane", "my-lane")).toBe(true); // the requested route echoed back
    expect(isMeterlessRouteIdentifier("nvidia/nemotron-3-super", "meterless/auto")).toBe(false);
  });

  it("reports an underlying model only when the runtime names a non-route model", () => {
    const echoed = attributeModel(meterlessRoute, "meterless/auto");
    expect(echoed).toEqual({
      runtimeRoute: "meterless/auto",
      underlyingModel: null,
      underlyingModelSource: "UNPROVEN",
    });
    expect(attributeModel(meterlessRoute, null).underlyingModel).toBeNull();
    const named = attributeModel(meterlessRoute, "nvidia/nemotron-3-super");
    expect(named).toEqual({
      runtimeRoute: "meterless/auto",
      underlyingModel: "nvidia/nemotron-3-super",
      underlyingModelSource: "PROVIDER_REPORTED",
    });
  });

  it("carries route and model separately through a real reasoning call", async () => {
    const unproven = await make(meterlessRoute, "meterless/auto").reason({
      meta,
      outputSchema: schema,
    });
    expect(unproven).toMatchObject({
      runtimeRoute: "meterless/auto",
      underlyingModel: null,
      underlyingModelSource: "UNPROVEN",
      provider: "meterless",
      providerRequestId: "req-1",
    });
    // The recorded model id can never look like a bare model when only a route is known.
    expect(unproven.modelId).toBe("route:meterless/auto");

    const proven = await make(meterlessRoute, "nvidia/nemotron-3-super").reason({
      meta,
      outputSchema: schema,
    });
    expect(proven).toMatchObject({
      runtimeRoute: "meterless/auto",
      underlyingModel: "nvidia/nemotron-3-super",
      modelId: "nvidia/nemotron-3-super",
    });
  });

  it("LIVE acceptance evidence requires a Nemotron-family underlying model, not a reachable route", () => {
    expect(demonstratesNemotron(attributeModel(meterlessRoute, "meterless/auto"))).toBe(false);
    expect(demonstratesNemotron(attributeModel(meterlessRoute, "meterless/nemotron"))).toBe(false); // still a route id
    expect(
      demonstratesNemotron(attributeModel(meterlessRoute, "nvidia/llama-3.1-70b-instruct")),
    ).toBe(false);
    expect(
      demonstratesNemotron(attributeModel(meterlessRoute, "nvidia/nemotron-3-super-120b-a12b")),
    ).toBe(true);
    expect(demonstratesNemotron(attributeModel(nvidiaRoute, "nvidia/nemotron-test"))).toBe(true);
    expect(
      demonstratesNemotron(attributeModel({ ...nvidiaRoute, modelId: "meta/llama-3" }, null)),
    ).toBe(false);
  });
});

describe("structured output and secrecy", () => {
  it("returns schema-validated output and discards provider reasoning", async () => {
    const r = await make(meterlessRoute, "nvidia/nemotron-x").reason({
      meta,
      outputSchema: schema,
    });
    expect(r.output).toEqual({ decision: "A" });
    expect(JSON.stringify(r)).not.toContain("private");
  });

  it("rejects non-JSON, schema-violating and extra-field output", async () => {
    const respond = (content: string) =>
      new OpenAiCompatibleNemotronReasoner({
        route: meterlessRoute,
        fetch: (async () =>
          json({ model: "m", choices: [{ message: { content } }] })) as typeof fetch,
      });
    await expect(
      respond("I think A.").reason({ meta, outputSchema: schema }),
    ).rejects.toBeInstanceOf(ReasoningProviderError);
    await expect(
      respond('{"decision":"C"}').reason({ meta, outputSchema: schema }),
    ).rejects.toBeInstanceOf(ReasoningOutputInvalidError);
    await expect(
      respond('{"decision":"A","tool":"rm -rf"}').reason({ meta, outputSchema: schema }),
    ).rejects.toBeInstanceOf(ReasoningOutputInvalidError);
    expect(extractJsonObject('Sure! {"a":1} done')).toEqual({ a: 1 });
  });

  it("surfaces failures without leaking any credential", async () => {
    for (const route of [meterlessRoute, nvidiaRoute]) {
      const failing = make(route, null, [], 401);
      const err = await failing.reason({ meta, outputSchema: schema }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ReasoningProviderError);
      for (const secret of [TOKEN, NV_KEY]) {
        expect(String((err as Error).message)).not.toContain(secret);
        expect(JSON.stringify(failing.calls)).not.toContain(secret);
      }
      const unreachable = new OpenAiCompatibleNemotronReasoner({
        route,
        fetch: (() => Promise.reject(new TypeError(`${TOKEN} ${NV_KEY}`))) as typeof fetch,
      });
      const e2 = await unreachable.reason({ meta, outputSchema: schema }).catch((e: unknown) => e);
      expect(String((e2 as Error).message)).not.toContain(TOKEN);
      expect(String((e2 as Error).message)).not.toContain(NV_KEY);
    }
  });
});
