import { describe, expect, it } from "vitest";
import { T0 } from "../../test-support/fixtures";
import { CONSEQUENCE_EDGE_TYPES, consequenceEdgeSchema } from "./edge";
import { EFFECT_CLASSIFICATIONS, effectClassificationSchema, effectSchema } from "./effect";
import { CONSEQUENCE_NODE_KINDS, consequenceNodeSchema } from "./node";

const edge = { edgeId: "e1", fromNodeId: "n1", toNodeId: "n2", type: "CAUSED", createdAt: T0 };

describe("ConsequenceEdge", () => {
  it("accepts exactly the six initial edge types", () => {
    expect([...CONSEQUENCE_EDGE_TYPES]).toEqual([
      "INFORMED",
      "DERIVED_FROM",
      "CAUSED",
      "MUTATED",
      "DEPENDS_ON",
      "SUPERSEDES",
    ]);
    for (const type of CONSEQUENCE_EDGE_TYPES) {
      expect(consequenceEdgeSchema.safeParse({ ...edge, type }).success).toBe(true);
    }
  });

  it("rejects unsupported edge types and self-loops", () => {
    expect(consequenceEdgeSchema.safeParse({ ...edge, type: "RELATED_TO" }).success).toBe(false);
    expect(consequenceEdgeSchema.safeParse({ ...edge, toNodeId: "n1" }).success).toBe(false);
  });
});

describe("ConsequenceNode", () => {
  it("supports the five required categories and no others", () => {
    expect([...CONSEQUENCE_NODE_KINDS]).toEqual([
      "TRUTH_VERSION",
      "MEMORY",
      "DECISION",
      "ACTION",
      "BUSINESS_OBJECT",
    ]);
    const node = { nodeId: "n1", kind: "DECISION", refId: "dec_1", createdAt: T0 };
    expect(consequenceNodeSchema.parse(node).attributes).toEqual({});
    expect(consequenceNodeSchema.safeParse({ ...node, kind: "AGENT" }).success).toBe(false);
  });
});

describe("Effect classification", () => {
  it("accepts only REVERSIBLE, COMPENSABLE, IRREVERSIBLE", () => {
    expect([...EFFECT_CLASSIFICATIONS]).toEqual(["REVERSIBLE", "COMPENSABLE", "IRREVERSIBLE"]);
    for (const c of EFFECT_CLASSIFICATIONS) {
      expect(effectClassificationSchema.safeParse(c).success).toBe(true);
    }
    for (const bad of ["ROLLED_BACK", "reversible", "UNKNOWN", "", null]) {
      expect(effectClassificationSchema.safeParse(bad).success).toBe(false);
    }
  });

  it("requires a deterministic classifier, never a model", () => {
    const effect = {
      effectId: "eff_1",
      actionNodeId: "n1",
      classification: "IRREVERSIBLE",
      target: { entityType: "email", entityId: "m1" },
      description: "Notification sent to supplier",
      classifiedBy: "DETERMINISTIC_RULE",
      ruleId: "rule_email_sent",
      occurredAt: T0,
    };
    expect(effectSchema.safeParse(effect).success).toBe(true);
    expect(effectSchema.safeParse({ ...effect, classifiedBy: "LLM" }).success).toBe(false);
  });
});
