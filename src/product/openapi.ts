import { z } from "zod";
import { decisionIngestSchema, truthRevisionIngestSchema } from "./ingest-contracts";

/** OpenAPI is generated from the same Zod schemas the server validates with, so they cannot drift. */
export function openApiDocument() {
  const schema = (s: z.ZodType) => z.toJSONSchema(s, { io: "input", unrepresentable: "any" });
  const err = {
    description: "Error",
    content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
  };
  const secured = [{ ApiKey: [] }];
  return {
    openapi: "3.1.0",
    info: {
      title: "Brindle Evidence API",
      version: "1.0.0",
      description:
        "Send decisions your agents made and the facts they relied on. Brindle reports what a truth change affected. This API receives evidence only: there is no endpoint that runs an action or grants recovery authority.",
    },
    servers: [{ url: "/" }],
    security: secured,
    paths: {
      "/api/v1/decisions": {
        post: {
          summary: "Record an agent decision",
          description:
            "Idempotent on decisionId. A different body with the same decisionId returns 409.",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/Decision" } } },
          },
          responses: {
            "201": { description: "Recorded" },
            "200": { description: "Already recorded with identical content" },
            "401": err,
            "409": err,
            "413": err,
            "422": err,
            "429": err,
          },
        },
      },
      "/api/v1/truth-revisions": {
        post: {
          summary: "Report that a fact changed",
          description:
            "Opens an incident if recorded decisions relied on the previous value. Idempotent on revisionId.",
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/TruthRevision" } },
            },
          },
          responses: {
            "201": { description: "Recorded; incidentId is set when decisions were affected" },
            "200": { description: "Already recorded" },
            "401": err,
            "409": err,
            "422": err,
            "429": err,
          },
        },
      },
      "/api/v1/incidents": {
        get: {
          summary: "List incidents in this workspace",
          responses: { "200": { description: "OK" }, "401": err },
        },
      },
      "/api/v1/incidents/{id}": {
        get: {
          summary: "Get one incident",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" }, "401": err, "404": err },
        },
      },
      "/api/v1/receipts/{id}": {
        get: {
          summary: "Get a Recovery Receipt",
          description: "404 unless Brindle actually recovered and verified that incident.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" }, "401": err, "404": err },
        },
      },
    },
    components: {
      securitySchemes: {
        ApiKey: {
          type: "http",
          scheme: "bearer",
          description: "Key created in Developer. Starts with brk_.",
        },
      },
      schemas: {
        Decision: schema(decisionIngestSchema),
        TruthRevision: schema(truthRevisionIngestSchema),
        Error: {
          type: "object",
          required: ["error"],
          properties: {
            error: {
              type: "object",
              required: ["code", "message"],
              properties: {
                code: { type: "string" },
                message: { type: "string" },
                details: {},
              },
            },
          },
        },
      },
    },
  };
}
