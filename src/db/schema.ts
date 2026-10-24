import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { PO_STATUSES } from "../brindle/business/sandbox";
import { COUNTERFACTUAL_RESULTS } from "../brindle/counterfactual/assessment";
import { CONSEQUENCE_EDGE_TYPES } from "../brindle/graph/edge";
import { EFFECT_CLASSIFICATIONS } from "../brindle/graph/effect";
import { CONSEQUENCE_NODE_KINDS } from "../brindle/graph/node";
import { RECOVERY_VERDICTS } from "../brindle/receipts/recovery-receipt";
import { RECOVERY_MODES } from "../brindle/recovery/capability";
import { INCIDENT_STATUSES } from "../brindle/recovery/incident";
import { RECOVERY_STEP_STATUSES } from "../brindle/recovery/step";
import { INVARIANT_STATUSES } from "../brindle/verification/invariant-result";

/*
 * Time conventions
 *  - valid_*     : valid time, when the fact was true in the world.
 *  - observed_at : when Brindle learned it (transaction/knowledge time).
 *  - created_at  : when this row was physically written (database clock).
 * These three are different things and are never substituted for each other.
 *
 * Enums are generated from the same constants the Zod contracts use, so the
 * database cannot drift from the domain vocabulary.
 */

const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => tstz("created_at").notNull().defaultNow();

export const consequenceNodeKindEnum = pgEnum("consequence_node_kind", CONSEQUENCE_NODE_KINDS);
export const consequenceEdgeTypeEnum = pgEnum("consequence_edge_type", CONSEQUENCE_EDGE_TYPES);
export const effectClassificationEnum = pgEnum("effect_classification", EFFECT_CLASSIFICATIONS);
export const counterfactualResultEnum = pgEnum("counterfactual_result", COUNTERFACTUAL_RESULTS);
export const incidentStatusEnum = pgEnum("incident_status", INCIDENT_STATUSES);
export const recoveryModeEnum = pgEnum("recovery_mode", RECOVERY_MODES);
export const recoveryStepStatusEnum = pgEnum("recovery_step_status", RECOVERY_STEP_STATUSES);
export const invariantStatusEnum = pgEnum("invariant_status", INVARIANT_STATUSES);
export const recoveryVerdictEnum = pgEnum("recovery_verdict", RECOVERY_VERDICTS);

/** One row per (logical fact, version). Versions are immutable; corrections add rows. */
export const truthAssertions = pgTable(
  "truth_assertions",
  {
    id: text("id").primaryKey(),
    assertionId: text("assertion_id").notNull(),
    version: integer("version").notNull(),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    sourceId: text("source_id").notNull(),
    factKey: text("fact_key").notNull(),
    value: jsonb("value").notNull(),
    validFrom: tstz("valid_from").notNull(),
    validTo: tstz("valid_to"),
    observedAt: tstz("observed_at").notNull(),
    provenance: jsonb("provenance").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("truth_assertions_assertion_version_uq").on(t.assertionId, t.version),
    unique("truth_assertions_identity_version_uq").on(
      t.subjectType,
      t.subjectId,
      t.sourceId,
      t.factKey,
      t.version,
    ),
    index("truth_assertions_subject_fact_idx").on(t.subjectType, t.subjectId, t.factKey),
    index("truth_assertions_observed_at_idx").on(t.observedAt),
    check("truth_assertions_version_chk", sql`${t.version} >= 1`),
    check(
      "truth_assertions_valid_range_chk",
      sql`${t.validTo} IS NULL OR ${t.validTo} > ${t.validFrom}`,
    ),
  ],
);

export const truthRevisions = pgTable(
  "truth_revisions",
  {
    id: text("id").primaryKey(),
    previousAssertionId: text("previous_assertion_id").notNull(),
    previousVersion: integer("previous_version").notNull(),
    replacementAssertionId: text("replacement_assertion_id").notNull(),
    replacementVersion: integer("replacement_version").notNull(),
    effectiveFrom: tstz("effective_from").notNull(),
    effectiveTo: tstz("effective_to"),
    observedAt: tstz("observed_at").notNull(),
    retroactive: boolean("retroactive").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "truth_revisions_previous_fk",
      columns: [t.previousAssertionId, t.previousVersion],
      foreignColumns: [truthAssertions.assertionId, truthAssertions.version],
    }),
    foreignKey({
      name: "truth_revisions_replacement_fk",
      columns: [t.replacementAssertionId, t.replacementVersion],
      foreignColumns: [truthAssertions.assertionId, truthAssertions.version],
    }),
    unique("truth_revisions_pair_uq").on(
      t.previousAssertionId,
      t.previousVersion,
      t.replacementVersion,
    ),
    index("truth_revisions_observed_at_idx").on(t.observedAt),
    check(
      "truth_revisions_same_fact_chk",
      sql`${t.previousAssertionId} = ${t.replacementAssertionId}`,
    ),
    check("truth_revisions_version_order_chk", sql`${t.replacementVersion} > ${t.previousVersion}`),
    check(
      "truth_revisions_range_chk",
      sql`${t.effectiveTo} IS NULL OR ${t.effectiveTo} > ${t.effectiveFrom}`,
    ),
    // The retroactive flag is derived, never trusted: valid time begins before Brindle learned of it.
    check(
      "truth_revisions_retroactive_chk",
      sql`${t.retroactive} = (${t.effectiveFrom} < ${t.observedAt})`,
    ),
  ],
);

export const decisionReceipts = pgTable(
  "decision_receipts",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id").notNull(),
    objective: text("objective").notNull(),
    decidedAt: tstz("decided_at").notNull(),
    policyVersion: text("policy_version").notNull(),
    modelId: text("model_id").notNull(),
    promptVersion: text("prompt_version").notNull(),
    schemaVersion: text("schema_version").notNull(),
    actionType: text("action_type").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    traceId: text("trace_id").notNull(),
    /** Full validated DecisionReceipt (truth/memory refs, justification, evidence). */
    payload: jsonb("payload").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("decision_receipts_agent_idx").on(t.agentId, t.decidedAt),
    index("decision_receipts_target_idx").on(t.targetType, t.targetId),
    index("decision_receipts_trace_idx").on(t.traceId),
  ],
);

/** The consequence graph is plain relational nodes + edges (no graph database). */
export const consequenceNodes = pgTable(
  "consequence_nodes",
  {
    id: text("id").primaryKey(),
    kind: consequenceNodeKindEnum("kind").notNull(),
    refId: text("ref_id").notNull(),
    label: text("label"),
    attributes: jsonb("attributes")
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
  },
  (t) => [unique("consequence_nodes_kind_ref_uq").on(t.kind, t.refId)],
);

export const consequenceEdges = pgTable(
  "consequence_edges",
  {
    id: text("id").primaryKey(),
    fromNodeId: text("from_node_id")
      .notNull()
      .references(() => consequenceNodes.id),
    toNodeId: text("to_node_id")
      .notNull()
      .references(() => consequenceNodes.id),
    type: consequenceEdgeTypeEnum("type").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("consequence_edges_from_to_type_uq").on(t.fromNodeId, t.toNodeId, t.type),
    // Both directions are traversed (downstream blast radius, upstream provenance).
    index("consequence_edges_from_idx").on(t.fromNodeId, t.type),
    index("consequence_edges_to_idx").on(t.toNodeId, t.type),
    check("consequence_edges_no_self_loop_chk", sql`${t.fromNodeId} <> ${t.toNodeId}`),
  ],
);

export const effects = pgTable(
  "effects",
  {
    id: text("id").primaryKey(),
    actionNodeId: text("action_node_id")
      .notNull()
      .references(() => consequenceNodes.id),
    classification: effectClassificationEnum("classification").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    description: text("description").notNull(),
    ruleId: text("rule_id").notNull(),
    occurredAt: tstz("occurred_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("effects_action_node_idx").on(t.actionNodeId),
    index("effects_target_idx").on(t.targetType, t.targetId),
  ],
);

export const counterfactualAssessments = pgTable(
  "counterfactual_assessments",
  {
    id: text("id").primaryKey(),
    decisionId: text("decision_id")
      .notNull()
      .references(() => decisionReceipts.id),
    revisionId: text("revision_id")
      .notNull()
      .references(() => truthRevisions.id),
    result: counterfactualResultEnum("result").notNull(),
    /** Original context + corrected fact; never "the present-day world". */
    reconstruction: jsonb("reconstruction").notNull(),
    counterfactualAction: jsonb("counterfactual_action"),
    uncertaintyReason: text("uncertainty_reason"),
    modelId: text("model_id"),
    traceId: text("trace_id").notNull(),
    assessedAt: tstz("assessed_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("counterfactual_decision_revision_idx").on(t.decisionId, t.revisionId),
    index("counterfactual_result_idx").on(t.revisionId, t.result),
    check(
      "counterfactual_changed_has_action_chk",
      sql`${t.result} <> 'CHANGED' OR ${t.counterfactualAction} IS NOT NULL`,
    ),
    check(
      "counterfactual_uncertain_has_reason_chk",
      sql`${t.result} <> 'UNCERTAIN' OR ${t.uncertaintyReason} IS NOT NULL`,
    ),
  ],
);

export const incidents = pgTable(
  "incidents",
  {
    id: text("id").primaryKey(),
    revisionId: text("revision_id")
      .notNull()
      .references(() => truthRevisions.id),
    status: incidentStatusEnum("status").notNull().default("OPEN"),
    openedAt: tstz("opened_at").notNull(),
    updatedAt: tstz("updated_at").notNull(),
    closure: jsonb("closure"),
    closureReceiptId: text("closure_receipt_id").references((): AnyPgColumn => recoveryReceipts.id),
    createdAt: createdAt(),
  },
  (t) => [
    index("incidents_revision_idx").on(t.revisionId),
    index("incidents_status_idx").on(t.status),
    // No false closure: RECOVERED if and only if closure proof is recorded.
    check(
      "incidents_closure_iff_recovered_chk",
      sql`(${t.status} = 'RECOVERED') = (${t.closure} IS NOT NULL AND ${t.closureReceiptId} IS NOT NULL)`,
    ),
    check("incidents_time_order_chk", sql`${t.updatedAt} >= ${t.openedAt}`),
  ],
);

export const recoverySteps = pgTable(
  "recovery_steps",
  {
    id: text("id").primaryKey(),
    incidentId: text("incident_id")
      .notNull()
      .references(() => incidents.id),
    effectId: text("effect_id")
      .notNull()
      .references(() => effects.id),
    /** Registered RecoveryCapability id (the registry lives in code, M4). */
    capabilityId: text("capability_id").notNull(),
    mode: recoveryModeEnum("mode").notNull(),
    effectClassification: effectClassificationEnum("effect_classification").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    parameters: jsonb("parameters").notNull(),
    status: recoveryStepStatusEnum("status").notNull().default("PLANNED"),
    plannedAt: tstz("planned_at").notNull(),
    executedAt: tstz("executed_at"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("recovery_steps_idempotency_uq").on(t.idempotencyKey),
    index("recovery_steps_incident_idx").on(t.incidentId, t.status),
    index("recovery_steps_effect_idx").on(t.effectId),
    // Irreversible effects are only ever remediated, never "rolled back".
    check(
      "recovery_steps_mode_matches_classification_chk",
      sql`(${t.effectClassification} = 'REVERSIBLE' AND ${t.mode} = 'REVERSE')
        OR (${t.effectClassification} = 'COMPENSABLE' AND ${t.mode} = 'COMPENSATE')
        OR (${t.effectClassification} = 'IRREVERSIBLE' AND ${t.mode} = 'REMEDIATE')`,
    ),
  ],
);

export const invariantResults = pgTable(
  "invariant_results",
  {
    id: text("id").primaryKey(),
    incidentId: text("incident_id")
      .notNull()
      .references(() => incidents.id),
    invariantId: text("invariant_id").notNull(),
    status: invariantStatusEnum("status").notNull(),
    verifierId: text("verifier_id").notNull(),
    /** Always a FRESH_INDEPENDENT_READ; executor success responses are not closure evidence. */
    observation: jsonb("observation").notNull(),
    detail: jsonb("detail"),
    verifiedAt: tstz("verified_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("invariant_results_incident_invariant_idx").on(t.incidentId, t.invariantId, t.verifiedAt),
    check(
      "invariant_results_fresh_read_chk",
      sql`${t.observation} ->> 'kind' = 'FRESH_INDEPENDENT_READ'`,
    ),
  ],
);

export const recoveryReceipts = pgTable(
  "recovery_receipts",
  {
    id: text("id").primaryKey(),
    incidentId: text("incident_id")
      .notNull()
      .references((): AnyPgColumn => incidents.id),
    revisionId: text("revision_id")
      .notNull()
      .references(() => truthRevisions.id),
    verdict: recoveryVerdictEnum("verdict").notNull(),
    issuedAt: tstz("issued_at").notNull(),
    /** Full validated RecoveryReceipt, including embedded invariant results. */
    payload: jsonb("payload").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("recovery_receipts_incident_idx").on(t.incidentId),
    // At most one RECOVERED receipt per incident.
    uniqueIndex("recovery_receipts_one_recovered_uq")
      .on(t.incidentId)
      .where(sql`${t.verdict} = 'RECOVERED'`),
  ],
);

/*
 * ===== SANDBOX BUSINESS SYSTEM (M1) =====
 * These tables are Brindle's own deterministic sandbox, NOT enterprise truth
 * (that lives in Zetaris) and NOT a production system. Rows are only written by
 * the deterministic executors after an authorization gate has passed.
 */
export const poStatusEnum = pgEnum("po_status", PO_STATUSES);
export const demoRunModeEnum = pgEnum("demo_run_mode", ["LIVE", "MOCK"]);
export const demoRunStatusEnum = pgEnum("demo_run_status", ["COMPLETED", "BLOCKED", "FAILED"]);

export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: text("id").primaryKey(),
    supplierId: text("supplier_id").notNull(),
    supplierName: text("supplier_name").notNull(),
    description: text("description").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull(),
    status: poStatusEnum("status").notNull().default("CREATED"),
    createdByDecisionId: text("created_by_decision_id")
      .notNull()
      .references(() => decisionReceipts.id),
    placedAt: tstz("placed_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("purchase_orders_supplier_idx").on(t.supplierId),
    check("purchase_orders_amount_chk", sql`${t.amountCents} > 0`),
  ],
);

export const financeApprovals = pgTable("finance_approvals", {
  id: text("id").primaryKey(),
  poId: text("po_id")
    .notNull()
    .unique()
    .references(() => purchaseOrders.id),
  approvedAmountCents: integer("approved_amount_cents").notNull(),
  currency: text("currency").notNull(),
  decisionId: text("decision_id")
    .notNull()
    .references(() => decisionReceipts.id),
  approvedAt: tstz("approved_at").notNull(),
  createdAt: createdAt(),
});

export const receivingAllocations = pgTable("receiving_allocations", {
  id: text("id").primaryKey(),
  poId: text("po_id")
    .notNull()
    .unique()
    .references(() => purchaseOrders.id),
  dockId: text("dock_id").notNull(),
  expectedArrival: tstz("expected_arrival").notNull(),
  decisionId: text("decision_id")
    .notNull()
    .references(() => decisionReceipts.id),
  allocatedAt: tstz("allocated_at").notNull(),
  createdAt: createdAt(),
});

/** A sandbox record that the supplier "was notified". Nothing is ever transmitted. */
export const supplierNotifications = pgTable(
  "supplier_notifications",
  {
    id: text("id").primaryKey(),
    poId: text("po_id")
      .notNull()
      .unique()
      .references(() => purchaseOrders.id),
    supplierId: text("supplier_id").notNull(),
    channel: text("channel").notNull(),
    subject: text("subject").notNull(),
    decisionId: text("decision_id")
      .notNull()
      .references(() => decisionReceipts.id),
    recordedAt: tstz("recorded_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [check("supplier_notifications_sandbox_chk", sql`${t.channel} = 'SANDBOX_RECORD'`)],
);

/** One row per orchestrated run: which mode and model produced the world, and how it ended. */
export const demoRuns = pgTable(
  "demo_runs",
  {
    id: text("id").primaryKey(),
    mode: demoRunModeEnum("mode").notNull(),
    status: demoRunStatusEnum("status").notNull(),
    truthSourceId: text("truth_source_id").notNull(),
    reasoningProvider: text("reasoning_provider").notNull(),
    modelId: text("model_id").notNull(),
    traceId: text("trace_id").notNull(),
    startedAt: tstz("started_at").notNull(),
    finishedAt: tstz("finished_at").notNull(),
    /** Secret-free evidence: gate outcomes, provider request ids. */
    detail: jsonb("detail").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("demo_runs_started_idx").on(t.startedAt)],
);

/** Durable plan, execution and corrective-remediation evidence. No executor response is closure proof. */
export const recoveryEvidence = pgTable(
  "recovery_evidence",
  {
    id: text("id").primaryKey(),
    incidentId: text("incident_id")
      .notNull()
      .references(() => incidents.id),
    stepId: text("step_id").references(() => recoverySteps.id),
    kind: text("kind").notNull(),
    payload: jsonb("payload").notNull(),
    recordedAt: tstz("recorded_at").notNull(),
  },
  (t) => [
    index("recovery_evidence_incident_idx").on(t.incidentId),
    index("recovery_evidence_step_idx").on(t.stepId),
    uniqueIndex("recovery_evidence_one_execution_uq")
      .on(t.stepId)
      .where(sql`${t.kind} IN ('EXECUTION', 'REMEDIATION')`),
    uniqueIndex("recovery_evidence_one_plan_uq")
      .on(t.incidentId)
      .where(sql`${t.kind} = 'PLAN'`),
    check(
      "recovery_evidence_kind_chk",
      sql`${t.kind} IN ('PLAN', 'EXECUTION', 'FAILURE', 'REMEDIATION')`,
    ),
    check("recovery_evidence_step_chk", sql`(${t.kind} = 'PLAN') = (${t.stepId} IS NULL)`),
  ],
);

/** H-MEM canonical state snapshot; PostgreSQL is authoritative, never a second memory database. */
export const hmemState = pgTable("hmem_state", {
  id: text("id").primaryKey(),
  upstreamSha: text("upstream_sha").notNull(),
  payload: jsonb("payload").notNull(),
  updatedAt: tstz("updated_at").notNull(),
});
/** Append-only H-MEM trust ledger, committed atomically with canonical state changes. */
export const hmemLedger = pgTable(
  "hmem_ledger",
  {
    id: text("id").primaryKey(),
    ordinal: integer("ordinal").notNull().unique(),
    memoryId: text("memory_id").notNull(),
    action: text("action").notNull(),
    payload: jsonb("payload").notNull(),
    recordedAt: tstz("recorded_at").notNull(),
  },
  (t) => [
    index("hmem_ledger_memory_idx").on(t.memoryId),
    index("hmem_ledger_time_idx").on(t.recordedAt),
  ],
);
