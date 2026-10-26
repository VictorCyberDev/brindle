import { randomUUID } from "node:crypto";
import type { z } from "zod";
import {
  authorizeFinance,
  authorizeOperations,
  authorizeProcurement,
  type GateResult,
} from "../brindle/business/authorization";
import {
  FACT_KEYS,
  findAssertion,
  procurementPolicyValueSchema,
  type ProcurementPolicyValue,
} from "../brindle/business/eligibility";
import {
  financeProposalSchema,
  operationsProposalSchema,
  procurementProposalSchema,
  unknownCitedEvidence,
  FINANCE_DECISIONS,
  OPERATIONS_DECISIONS,
  PROCUREMENT_DECISIONS,
  type BusinessActor,
} from "../brindle/business/proposals";
import type { PurchaseOrder } from "../brindle/business/sandbox";
import {
  decisionReceiptSchema,
  type DecisionReceipt,
  type EvidenceItem,
} from "../brindle/receipts/decision-receipt";
import type { TruthAssertion } from "../brindle/truth/assertion";
import type { Db } from "../db/client";
import { ReasoningOutputInvalidError, type NemotronReasoner } from "../integrations/nemotron";
import type { ZetarisTruthReader } from "../integrations/zetaris/contract";
import { POLICY_ID } from "./seed-data";
import {
  executeApprovePo,
  executeCreatePo,
  executeScheduleReceiving,
  getAllocation,
  getApproval,
  getPo,
  loadTruthByRefs,
  persistTruth,
  recordRun,
} from "./store";
import { DEMO_TRANSACTIONS, type DemoTransaction } from "./transactions";

export interface WorldDeps {
  db: Db;
  truth: ZetarisTruthReader;
  reasoner: NemotronReasoner;
  /** LIVE only when real sponsors back `truth` and `reasoner`. Recorded on the run. */
  mode: "LIVE" | "MOCK";
  truthSourceId: string;
  reasoningProvider: string;
  /** Used for the run record when no model call was made. */
  configuredModelId: string;
  now?: () => Date;
  newRunId?: () => string;
}

export type StepOutcome = {
  actor: BusinessActor;
  poId: string;
  decisionId: string;
  providerRequestId: string | null;
  /** The id recorded on the receipt: underlying model if demonstrated, else `route:<runtimeRoute>`. */
  servedModelId: string;
  /** Runtime lane that served the request. A route is not proof of the underlying model. */
  runtimeRoute: string | null;
  /** The model that executed, or null when not demonstrated. */
  underlyingModel: string | null;
};

export type WorldResult =
  | { status: "COMPLETED"; runId: string; traceId: string; steps: StepOutcome[] }
  | { status: "ALREADY_COMPLETE"; steps: [] }
  | {
      status: "BLOCKED";
      runId: string;
      traceId: string;
      actor: BusinessActor;
      poId: string;
      code: string;
      reasons: string[];
      message: string;
      steps: StepOutcome[];
    };

/** Existing sandbox state is neither empty nor complete: the operator must reset explicitly. */
export class PartialSandboxStateError extends Error {
  override name = "PartialSandboxStateError";
}

class Blocked extends Error {
  constructor(
    readonly actor: BusinessActor,
    readonly poId: string,
    readonly code: string,
    readonly reasons: string[],
    message: string,
  ) {
    super(message);
  }
}

const DAY_MS = 86_400_000;
const POLICY_EVIDENCE_ID = "ev-policy";

interface EvidenceBundle {
  /** What the model is shown. */
  prompt: Record<string, unknown>[];
  /** What the receipt records. */
  items: EvidenceItem[];
  ids: string[];
}

export function buildEvidence(
  truth: readonly TruthAssertion[],
  policy: ProcurementPolicyValue,
  documents: { evidenceId: string; documentId: string; summary: string }[] = [],
): EvidenceBundle {
  const prompt: Record<string, unknown>[] = [];
  const items: EvidenceItem[] = [];
  truth.forEach((a, i) => {
    const evidenceId = `ev-${i + 1}`;
    items.push({
      kind: "TRUTH_VERSION",
      evidenceId,
      assertionId: a.assertionId,
      version: a.version,
    });
    prompt.push({
      evidenceId,
      kind: "TRUTH",
      subject: a.subject,
      fact: a.factKey,
      value: a.value,
      validFrom: a.validFrom,
      validTo: a.validTo,
    });
  });
  items.push({
    kind: "POLICY",
    evidenceId: POLICY_EVIDENCE_ID,
    policyId: POLICY_ID,
    policyVersion: policy.policyVersion,
  });
  prompt.push({ evidenceId: POLICY_EVIDENCE_ID, kind: "POLICY", policy });
  for (const d of documents) {
    items.push({ kind: "DOCUMENT", evidenceId: d.evidenceId, documentId: d.documentId });
    prompt.push({ evidenceId: d.evidenceId, kind: "SANDBOX_RECORD", summary: d.summary });
  }
  return { prompt, items, ids: items.map((e) => e.evidenceId) };
}

interface ActorSpec<S extends z.ZodType> {
  actor: BusinessActor;
  agentId: string;
  slug: "procurement" | "finance" | "operations";
  promptVersion: string;
  schemaVersion: string;
  schema: S;
  decisions: readonly string[];
  instructions: string;
}

const PROCUREMENT = {
  actor: "PROCUREMENT",
  agentId: "agent.procurement",
  slug: "procurement",
  promptVersion: "procurement-prompt-v1",
  schemaVersion: "procurement-proposal-v1",
  schema: procurementProposalSchema,
  decisions: PROCUREMENT_DECISIONS,
  instructions:
    "You are the Procurement actor. Decide whether the requested supplier should be selected for this purchase request, using ONLY the evidence provided. " +
    "Propose SELECT_SUPPLIER only if the evidence shows the supplier is enabled, APPROVED, holds the policy's required certification with status VALID covering today, and the request fits the policy. Otherwise propose DECLINE_SUPPLIER. " +
    "Set target to the supplier id. Cite evidence ids in rationale.factors. Set confidence between 0 and 1.",
} as const satisfies ActorSpec<typeof procurementProposalSchema>;

const FINANCE = {
  actor: "FINANCE",
  agentId: "agent.finance",
  slug: "finance",
  promptVersion: "finance-prompt-v1",
  schemaVersion: "finance-proposal-v1",
  schema: financeProposalSchema,
  decisions: FINANCE_DECISIONS,
  instructions:
    "You are the Finance actor. Decide whether to approve the purchase order, using ONLY the evidence provided. " +
    "Propose APPROVE_PO only if the amount and currency are within the procurement policy and the supplier remains eligible in the evidence. Otherwise propose REJECT_PO. " +
    "Set target to the PO id. Cite evidence ids in rationale.factors. Set confidence between 0 and 1.",
} as const satisfies ActorSpec<typeof financeProposalSchema>;

const OPERATIONS = {
  actor: "OPERATIONS",
  agentId: "agent.operations",
  slug: "operations",
  promptVersion: "operations-prompt-v1",
  schemaVersion: "operations-proposal-v1",
  schema: operationsProposalSchema,
  decisions: OPERATIONS_DECISIONS,
  instructions:
    "You are the Operations actor. Decide whether to schedule receiving for the purchase order, using ONLY the evidence provided. " +
    "Propose SCHEDULE_RECEIVING only if the PO is finance-approved and nothing is already scheduled. Otherwise propose HOLD_RECEIVING. " +
    "Set target to the PO id. Cite evidence ids in rationale.factors. Set confidence between 0 and 1.",
} as const satisfies ActorSpec<typeof operationsProposalSchema>;

export const M1_ACTOR_SPECS = { PROCUREMENT, FINANCE, OPERATIONS } as const;

/** Asks the model for a proposal. Anything that is not a schema-valid proposal citing only shown evidence is a Blocked outcome. */
export async function propose<
  S extends z.ZodType<{
    decision: string;
    target: string;
    rationale: { summary: string; factors: { factor: string; evidenceIds: string[] }[] };
    confidence: number;
  }>,
>(
  deps: Pick<WorldDeps, "reasoner">,
  spec: ActorSpec<S>,
  poId: string,
  traceId: string,
  target: string,
  context: Record<string, unknown>,
  evidence: EvidenceBundle,
) {
  let result;
  try {
    result = await deps.reasoner.reason({
      meta: {
        task: "DECISION",
        promptVersion: spec.promptVersion,
        schemaVersion: spec.schemaVersion,
        traceId,
        input: JSON.parse(
          JSON.stringify({
            actor: spec.actor,
            instructions: spec.instructions,
            target,
            allowedDecisions: spec.decisions,
            ...context,
            evidence: evidence.prompt,
          }),
        ),
      },
      outputSchema: spec.schema,
    });
  } catch (error) {
    if (error instanceof ReasoningOutputInvalidError) {
      throw new Blocked(
        spec.actor,
        poId,
        "MODEL_OUTPUT_INVALID",
        ["MODEL_OUTPUT_INVALID"],
        error.message,
      );
    }
    throw error;
  }
  const proposal = result.output;
  const unknown = unknownCitedEvidence(proposal, evidence.ids);
  if (unknown.length > 0) {
    throw new Blocked(
      spec.actor,
      poId,
      "UNKNOWN_EVIDENCE_CITED",
      ["UNKNOWN_EVIDENCE_CITED"],
      `Proposal cites evidence that was not provided: ${unknown.join(", ")}`,
    );
  }
  return { proposal, result };
}

function requireAllowed(gate: GateResult, actor: BusinessActor, poId: string): void {
  if (!gate.allowed) throw new Blocked(actor, poId, gate.code, gate.reasons, gate.message);
}

function buildReceipt(input: {
  spec: ActorSpec<z.ZodType>;
  poId: string;
  decisionId: string;
  objective: string;
  decidedAt: string;
  truth: readonly TruthAssertion[];
  evidence: EvidenceBundle;
  policyVersion: string;
  modelId: string;
  traceId: string;
  actionType: string;
  parameters: Record<string, string | number>;
  targetEntity: { entityType: string; entityId: string };
  rationale: { summary: string; factors: { factor: string; evidenceIds: string[] }[] };
}): DecisionReceipt {
  return decisionReceiptSchema.parse({
    decisionId: input.decisionId,
    agentId: input.spec.agentId,
    objective: input.objective,
    decidedAt: input.decidedAt,
    truthRefs: input.truth.map((a) => ({ assertionId: a.assertionId, version: a.version })),
    memoryRefs: [],
    policyVersion: input.policyVersion,
    modelId: input.modelId,
    promptVersion: input.spec.promptVersion,
    schemaVersion: input.spec.schemaVersion,
    chosenAction: { actionType: input.actionType, parameters: input.parameters },
    targetEntity: input.targetEntity,
    justification: input.rationale,
    evidence: input.evidence.items,
    traceId: input.traceId,
  });
}

async function runTransaction(
  deps: WorldDeps,
  tx: DemoTransaction,
  policyAssertion: TruthAssertion,
  policy: ProcurementPolicyValue,
  traceId: string,
  now: () => Date,
): Promise<StepOutcome[]> {
  const { db } = deps;
  const { request } = tx;
  const steps: StepOutcome[] = [];
  const iso = () => now().toISOString();

  /* ---- Procurement ---- */
  const supplierTruth = await persistTruth(
    db,
    await deps.truth.readAssertions({
      subject: { entityType: "supplier", entityId: request.supplierId },
    }),
  );
  const procurementTruth = [...supplierTruth, policyAssertion];
  const procEvidence = buildEvidence(procurementTruth, policy);
  const procDecisionId = `dec:${request.poId}:procurement`;
  const procAsOf = iso();

  const proc = await propose(
    deps,
    PROCUREMENT,
    request.poId,
    traceId,
    request.supplierId,
    { request },
    procEvidence,
  );
  requireAllowed(
    authorizeProcurement({
      proposal: proc.proposal,
      request,
      assertions: procurementTruth,
      policy,
      asOf: procAsOf,
      existingPo: await getPo(db, request.poId),
    }),
    "PROCUREMENT",
    request.poId,
  );
  const procReceipt = buildReceipt({
    spec: PROCUREMENT,
    poId: request.poId,
    decisionId: procDecisionId,
    objective: `Select a supplier for ${request.poId}: ${request.description}`,
    decidedAt: procAsOf,
    truth: procurementTruth,
    evidence: procEvidence,
    policyVersion: policy.policyVersion,
    modelId: proc.result.modelId,
    traceId,
    actionType: "SELECT_SUPPLIER",
    parameters: {
      poId: request.poId,
      supplierId: request.supplierId,
      amountCents: request.amountCents,
      currency: request.currency,
    },
    targetEntity: { entityType: "supplier", entityId: request.supplierId },
    rationale: proc.proposal.rationale,
  });
  const po: PurchaseOrder = {
    poId: request.poId,
    supplierId: request.supplierId,
    supplierName: tx.supplierName,
    description: request.description,
    amountCents: request.amountCents,
    currency: request.currency,
    status: "CREATED",
    createdByDecisionId: procDecisionId,
    createdAt: procAsOf,
  };
  await executeCreatePo(db, procReceipt, po);
  steps.push({
    actor: "PROCUREMENT",
    poId: request.poId,
    decisionId: procDecisionId,
    providerRequestId: proc.result.providerRequestId ?? null,
    servedModelId: proc.result.modelId,
    runtimeRoute: proc.result.runtimeRoute ?? null,
    underlyingModel: proc.result.underlyingModel ?? null,
  });

  /* ---- Finance: decides on the PERSISTED truth context the PO was created under ---- */
  const contextTruth = await loadTruthByRefs(db, procReceipt.truthRefs);
  const createdPo = (await getPo(db, request.poId))!;
  const finAsOf = iso();
  const finEvidence = buildEvidence(contextTruth, policy, [
    {
      evidenceId: "ev-po",
      documentId: createdPo.poId,
      summary: `${createdPo.poId} ${createdPo.status}: ${createdPo.description}, ${createdPo.amountCents} ${createdPo.currency} cents, supplier ${createdPo.supplierId}`,
    },
  ]);
  const finDecisionId = `dec:${request.poId}:finance`;
  const fin = await propose(
    deps,
    FINANCE,
    request.poId,
    traceId,
    createdPo.poId,
    { purchaseOrder: createdPo },
    finEvidence,
  );
  requireAllowed(
    authorizeFinance({
      proposal: fin.proposal,
      po: createdPo,
      existingApproval: await getApproval(db, request.poId),
      contextAssertions: contextTruth,
      policy,
      asOf: finAsOf,
    }),
    "FINANCE",
    request.poId,
  );
  const finReceipt = buildReceipt({
    spec: FINANCE,
    poId: request.poId,
    decisionId: finDecisionId,
    objective: `Approve or reject ${request.poId} against procurement policy`,
    decidedAt: finAsOf,
    truth: contextTruth,
    evidence: finEvidence,
    policyVersion: policy.policyVersion,
    modelId: fin.result.modelId,
    traceId,
    actionType: "APPROVE_PO",
    parameters: {
      poId: request.poId,
      approvedAmountCents: createdPo.amountCents,
      currency: createdPo.currency,
    },
    targetEntity: { entityType: "purchase_order", entityId: request.poId },
    rationale: fin.proposal.rationale,
  });
  await executeApprovePo(db, finReceipt, {
    approvalId: `fin-apr:${request.poId}`,
    poId: request.poId,
    approvedAmountCents: createdPo.amountCents,
    currency: createdPo.currency,
    decisionId: finDecisionId,
    approvedAt: finAsOf,
  });
  steps.push({
    actor: "FINANCE",
    poId: request.poId,
    decisionId: finDecisionId,
    providerRequestId: fin.result.providerRequestId ?? null,
    servedModelId: fin.result.modelId,
    runtimeRoute: fin.result.runtimeRoute ?? null,
    underlyingModel: fin.result.underlyingModel ?? null,
  });

  /* ---- Operations ---- */
  const approvedPo = (await getPo(db, request.poId))!;
  const approval = await getApproval(db, request.poId);
  const opsAt = iso();
  const opsEvidence = buildEvidence(contextTruth, policy, [
    {
      evidenceId: "ev-po",
      documentId: approvedPo.poId,
      summary: `${approvedPo.poId} ${approvedPo.status}: ${approvedPo.description}`,
    },
    {
      evidenceId: "ev-approval",
      documentId: `fin-apr:${request.poId}`,
      summary: approval
        ? `Finance approval recorded for ${approval.approvedAmountCents} ${approval.currency} cents`
        : "No finance approval",
    },
  ]);
  const opsDecisionId = `dec:${request.poId}:operations`;
  const ops = await propose(
    deps,
    OPERATIONS,
    request.poId,
    traceId,
    approvedPo.poId,
    { purchaseOrder: approvedPo },
    opsEvidence,
  );
  requireAllowed(
    authorizeOperations({
      proposal: ops.proposal,
      po: approvedPo,
      approval,
      existingAllocation: await getAllocation(db, request.poId),
    }),
    "OPERATIONS",
    request.poId,
  );
  // Dock and arrival are chosen by deterministic rule, not by the model.
  const dockId = "DOCK-3";
  const expectedArrival = new Date(new Date(opsAt).getTime() + 14 * DAY_MS).toISOString();
  const opsReceipt = buildReceipt({
    spec: OPERATIONS,
    poId: request.poId,
    decisionId: opsDecisionId,
    objective: `Schedule receiving for ${request.poId}`,
    decidedAt: opsAt,
    truth: contextTruth,
    evidence: opsEvidence,
    policyVersion: policy.policyVersion,
    modelId: ops.result.modelId,
    traceId,
    actionType: "SCHEDULE_RECEIVING",
    parameters: { poId: request.poId, dockId, expectedArrival },
    targetEntity: { entityType: "purchase_order", entityId: request.poId },
    rationale: ops.proposal.rationale,
  });
  await executeScheduleReceiving(
    db,
    opsReceipt,
    {
      allocationId: `rcv:${request.poId}`,
      poId: request.poId,
      dockId,
      expectedArrival,
      decisionId: opsDecisionId,
      createdAt: opsAt,
    },
    {
      notificationId: `notif:${request.poId}`,
      poId: request.poId,
      supplierId: request.supplierId,
      channel: "SANDBOX_RECORD",
      subject: `[SANDBOX] ${request.poId} approved; receiving scheduled at ${dockId}`,
      decisionId: opsDecisionId,
      recordedAt: opsAt,
    },
  );
  steps.push({
    actor: "OPERATIONS",
    poId: request.poId,
    decisionId: opsDecisionId,
    providerRequestId: ops.result.providerRequestId ?? null,
    servedModelId: ops.result.modelId,
    runtimeRoute: ops.result.runtimeRoute ?? null,
    underlyingModel: ops.result.underlyingModel ?? null,
  });
  return steps;
}

/**
 * Runs the pre-incident "successful agent world": truth -> reasoning ->
 * deterministic authorization -> sandbox mutation -> Decision Receipt, for the
 * primary transaction (PO-827) and the unrelated control (PO-901).
 * Idempotent: already-complete state yields ALREADY_COMPLETE with no side
 * effects; partial state demands an explicit reset.
 */
export async function runSuccessWorld(
  deps: WorldDeps,
  transactions: readonly DemoTransaction[] = DEMO_TRANSACTIONS,
): Promise<WorldResult> {
  const now = deps.now ?? (() => new Date());
  const { db } = deps;

  const existing = await Promise.all(transactions.map((t) => getPo(db, t.request.poId)));
  if (existing.every((po) => po?.status === "RECEIVING_SCHEDULED")) {
    return { status: "ALREADY_COMPLETE", steps: [] };
  }
  if (existing.some((po) => po !== undefined)) {
    throw new PartialSandboxStateError(
      "Sandbox state is partially populated; reset it explicitly before running again.",
    );
  }

  const runId = (deps.newRunId ?? randomUUID)();
  const traceId = `trace:${runId}`;
  const startedAt = now().toISOString();
  const steps: StepOutcome[] = [];

  const finish = async (status: "COMPLETED" | "BLOCKED" | "FAILED", detail: unknown) => {
    await recordRun(db, {
      runId,
      mode: deps.mode,
      status,
      truthSourceId: deps.truthSourceId,
      reasoningProvider: deps.reasoningProvider,
      modelId: steps[0]?.servedModelId ?? deps.configuredModelId,
      traceId,
      startedAt,
      finishedAt: now().toISOString(),
      detail,
    });
  };

  try {
    const policyAssertions = await persistTruth(
      db,
      await deps.truth.readAssertions({ subject: { entityType: "policy", entityId: POLICY_ID } }),
    );
    const policyAssertion = findAssertion(
      policyAssertions,
      { entityType: "policy", entityId: POLICY_ID },
      FACT_KEYS.procurementPolicy,
    );
    if (!policyAssertion)
      throw new Error("procurement policy truth was not returned by the truth source");
    const policy = procurementPolicyValueSchema.parse(policyAssertion.value);

    for (const tx of transactions) {
      steps.push(...(await runTransaction(deps, tx, policyAssertion, policy, traceId, now)));
    }
    await finish("COMPLETED", { steps });
    return { status: "COMPLETED", runId, traceId, steps };
  } catch (error) {
    if (error instanceof Blocked) {
      await finish("BLOCKED", {
        actor: error.actor,
        poId: error.poId,
        code: error.code,
        reasons: error.reasons,
        steps,
      });
      return {
        status: "BLOCKED",
        runId,
        traceId,
        actor: error.actor,
        poId: error.poId,
        code: error.code,
        reasons: error.reasons,
        message: error.message,
        steps,
      };
    }
    await finish("FAILED", {
      error: error instanceof Error ? error.name : "UnknownError",
      steps,
    }).catch(() => undefined);
    throw error;
  }
}
