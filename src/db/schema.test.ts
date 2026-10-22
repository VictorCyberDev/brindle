import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { getTableName } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { COUNTERFACTUAL_RESULTS } from "../brindle/counterfactual/assessment";
import { CONSEQUENCE_EDGE_TYPES } from "../brindle/graph/edge";
import { EFFECT_CLASSIFICATIONS } from "../brindle/graph/effect";
import { INCIDENT_STATUSES } from "../brindle/recovery/incident";
import * as schema from "./schema";

describe("schema vocabulary matches domain contracts", () => {
  it("builds database enums from the Zod contract constants", () => {
    expect(schema.consequenceEdgeTypeEnum.enumValues).toEqual([...CONSEQUENCE_EDGE_TYPES]);
    expect(schema.effectClassificationEnum.enumValues).toEqual([...EFFECT_CLASSIFICATIONS]);
    expect(schema.counterfactualResultEnum.enumValues).toEqual([...COUNTERFACTUAL_RESULTS]);
    expect(schema.incidentStatusEnum.enumValues).toEqual([...INCIDENT_STATUSES]);
  });

  it("defines a table for every required contract", () => {
    const tables = [
      schema.truthAssertions,
      schema.truthRevisions,
      schema.decisionReceipts,
      schema.consequenceNodes,
      schema.consequenceEdges,
      schema.effects,
      schema.counterfactualAssessments,
      schema.incidents,
      schema.recoverySteps,
      schema.invariantResults,
      schema.recoveryReceipts,
    ].map(getTableName);
    expect(tables).toHaveLength(11);
  });
});

/**
 * Applies the committed migration to an in-process PostgreSQL (PGlite): proves
 * the SQL is valid and that the database itself enforces the key invariants.
 */
describe("initial migration (applied to real PostgreSQL semantics via PGlite)", () => {
  let pg: PGlite;

  beforeAll(async () => {
    pg = new PGlite();
    const dir = join(process.cwd(), "drizzle");
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      await pg.exec(
        readFileSync(join(dir, file), "utf8").replaceAll("--> statement-breakpoint", ""),
      );
    }
    await pg.exec(`
      INSERT INTO truth_assertions (id, assertion_id, version, subject_type, subject_id, source_id, fact_key, value, valid_from, observed_at, provenance)
      VALUES ('tv1','a1',1,'supplier','s1','zetaris','cert','"VALID"','2026-01-01Z','2026-01-02Z','{}'),
             ('tv2','a1',2,'supplier','s1','zetaris','cert','"EXPIRED"','2026-01-01Z','2026-03-01Z','{}');
    `);
  });

  afterAll(async () => {
    await pg.close();
  });

  const revisionSql = (retroactive: boolean, effectiveFrom: string) => `
    INSERT INTO truth_revisions (id, previous_assertion_id, previous_version, replacement_assertion_id, replacement_version, effective_from, observed_at, retroactive)
    VALUES ('r_${retroactive}_${effectiveFrom.slice(0, 4)}','a1',1,'a1',2,'${effectiveFrom}','2026-03-01Z',${retroactive})`;

  it("stores valid time and observed time separately and derives retroactivity", async () => {
    await expect(pg.exec(revisionSql(false, "2026-01-01Z"))).rejects.toThrow(
      /truth_revisions_retroactive_chk/,
    );
    await pg.exec(revisionSql(true, "2026-01-01Z"));
    const { rows } = await pg.query<{ retroactive: boolean }>(
      "SELECT retroactive FROM truth_revisions",
    );
    expect(rows[0]?.retroactive).toBe(true);
  });

  it("rejects duplicate fact versions and inverted valid ranges", async () => {
    await expect(
      pg.exec(`INSERT INTO truth_assertions (id, assertion_id, version, subject_type, subject_id, source_id, fact_key, value, valid_from, observed_at, provenance)
        VALUES ('dup','a1',1,'supplier','s1','zetaris','cert','1','2026-01-01Z','2026-01-02Z','{}')`),
    ).rejects.toThrow(/duplicate key|unique/i);
    await expect(
      pg.exec(`INSERT INTO truth_assertions (id, assertion_id, version, subject_type, subject_id, source_id, fact_key, value, valid_from, valid_to, observed_at, provenance)
        VALUES ('bad','a9',1,'supplier','s1','zetaris','cert','1','2026-02-01Z','2026-01-01Z','2026-01-02Z','{}')`),
    ).rejects.toThrow(/truth_assertions_valid_range_chk/);
  });

  it("represents the consequence graph relationally and forbids self-loops and duplicates", async () => {
    await pg.exec(
      `INSERT INTO consequence_nodes (id, kind, ref_id) VALUES ('n1','DECISION','d1'),('n2','ACTION','act1')`,
    );
    await pg.exec(
      `INSERT INTO consequence_edges (id, from_node_id, to_node_id, type) VALUES ('e1','n1','n2','CAUSED')`,
    );
    await expect(
      pg.exec(
        `INSERT INTO consequence_edges (id, from_node_id, to_node_id, type) VALUES ('e2','n1','n1','CAUSED')`,
      ),
    ).rejects.toThrow(/no_self_loop/);
    await expect(
      pg.exec(
        `INSERT INTO consequence_edges (id, from_node_id, to_node_id, type) VALUES ('e3','n1','n2','CAUSED')`,
      ),
    ).rejects.toThrow(/duplicate key|unique/i);
    await expect(
      pg.exec(
        `INSERT INTO consequence_edges (id, from_node_id, to_node_id, type) VALUES ('e4','n1','n2','RELATED_TO')`,
      ),
    ).rejects.toThrow(/invalid input value for enum/);
  });

  it("refuses RECOVERED incidents without closure proof, and reversing irreversible effects", async () => {
    await expect(
      pg.exec(
        `INSERT INTO incidents (id, revision_id, status, opened_at, updated_at) VALUES ('i_bad','r_true_2026','RECOVERED','2026-03-02Z','2026-03-02Z')`,
      ),
    ).rejects.toThrow(/incidents_closure_iff_recovered_chk/);
    await pg.exec(
      `INSERT INTO incidents (id, revision_id, status, opened_at, updated_at) VALUES ('i1','r_true_2026','OPEN','2026-03-02Z','2026-03-02Z')`,
    );
    await pg.exec(
      `INSERT INTO effects (id, action_node_id, classification, target_type, target_id, description, rule_id, occurred_at) VALUES ('eff1','n2','IRREVERSIBLE','email','m1','sent','rule','2026-02-01Z')`,
    );
    await expect(
      pg.exec(`INSERT INTO recovery_steps (id, incident_id, effect_id, capability_id, mode, effect_classification, idempotency_key, parameters, planned_at)
        VALUES ('st1','i1','eff1','cap','REVERSE','IRREVERSIBLE','k1','{}','2026-03-02Z')`),
    ).rejects.toThrow(/recovery_steps_mode_matches_classification_chk/);
  });

  it("enforces idempotency-key uniqueness and fresh-read invariant evidence", async () => {
    const step = (
      id: string,
    ) => `INSERT INTO recovery_steps (id, incident_id, effect_id, capability_id, mode, effect_classification, idempotency_key, parameters, planned_at)
      VALUES ('${id}','i1','eff1','cap','REMEDIATE','IRREVERSIBLE','same-key','{}','2026-03-02Z')`;
    await pg.exec(step("st_a"));
    await expect(pg.exec(step("st_b"))).rejects.toThrow(/duplicate key|unique/i);
    await expect(
      pg.exec(`INSERT INTO invariant_results (id, incident_id, invariant_id, status, verifier_id, observation, verified_at)
        VALUES ('ir1','i1','inv','PASS','v','{"kind":"EXECUTOR_SUCCESS_RESPONSE"}','2026-03-03Z')`),
    ).rejects.toThrow(/invariant_results_fresh_read_chk/);
  });

  it("requires a reason for UNCERTAIN and an action for CHANGED counterfactual results", async () => {
    await pg.exec(`INSERT INTO decision_receipts (id, agent_id, objective, decided_at, policy_version, model_id, prompt_version, schema_version, action_type, target_type, target_id, trace_id, payload)
      VALUES ('d1','ag','obj','2026-02-01Z','p','m','pv','sv','act','supplier','s1','tr','{}')`);
    const ca = (
      id: string,
      result: string,
    ) => `INSERT INTO counterfactual_assessments (id, decision_id, revision_id, result, reconstruction, trace_id, assessed_at)
      VALUES ('${id}','d1','r_true_2026','${result}','{}','tr','2026-03-02Z')`;
    await pg.exec(ca("ca_same", "SAME"));
    await expect(pg.exec(ca("ca_u", "UNCERTAIN"))).rejects.toThrow(
      /counterfactual_uncertain_has_reason_chk/,
    );
    await expect(pg.exec(ca("ca_c", "CHANGED"))).rejects.toThrow(
      /counterfactual_changed_has_action_chk/,
    );
  });
});
