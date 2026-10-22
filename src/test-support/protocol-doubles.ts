import { ZETARIS_SEED } from "../demo/seed-data";

/*
 * PROTOCOL TEST DOUBLES. They imitate the wire protocols of the Zetaris SQL API
 * and an OpenAI-compatible chat API so adapters can be tested without network
 * or credentials. They are NOT Zetaris and NOT Nemotron and are never evidence
 * of sponsor behaviour.
 */
export const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });

export interface Seen {
  method: string;
  url: string;
  headers: Headers;
  body: unknown;
}

/** Imitates the hackathon contract: POST /sql-editor/sqls/run -> {data: [...records]}. */
export function zetarisDouble(seen: Seen[]): typeof fetch {
  return (async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    seen.push({
      method: init?.method ?? "GET",
      url: u,
      headers: new Headers(init?.headers),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    if (u.endsWith("/sql-editor/sqls/run") && init?.method === "POST") {
      const select = (JSON.parse(String(init.body)) as { sql: string }).sql;
      const table = /FROM \w+\.(\w+) WHERE (\w+) = '([^']+)'/.exec(select)!;
      const rows = (ZETARIS_SEED as Record<string, readonly Record<string, unknown>[]>)[
        table[1]!
      ]!.filter((r) => r[table[2]!] === table[3]);
      return json({ data: rows });
    }
    return new Response("nope", { status: 404 });
  }) as typeof fetch;
}

/** Chat-completions double that answers like a well-behaved model, derived from the request's own evidence. */
export function chatDouble(
  seen: Seen[],
  modelId: string | null = "protocol-double-model",
): typeof fetch {
  return (async (url: RequestInfo | URL, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    seen.push({
      method: init?.method ?? "GET",
      url: String(url),
      headers: new Headers(init?.headers),
      body,
    });
    const input = JSON.parse(body.messages[1].content) as {
      target: string;
      allowedDecisions: string[];
      evidence: { evidenceId: string }[];
    };
    const proposal = {
      decision: input.allowedDecisions[0],
      target: input.target,
      rationale: {
        summary: "protocol double rationale",
        factors: [{ factor: "evidence reviewed", evidenceIds: [input.evidence[0]!.evidenceId] }],
      },
      confidence: 0.8,
    };
    return json(
      {
        model: modelId,
        choices: [{ message: { content: `<think>x</think>${JSON.stringify(proposal)}` } }],
      },
      { headers: { "x-request-id": `double-req-${seen.length}` } },
    );
  }) as typeof fetch;
}
