import type { TruthAssertion, TruthVersionRef } from "../truth/assertion";
import { evaluateSupplierEligibility, type ProcurementPolicyValue } from "./eligibility";
import type { FinanceProposal, OperationsProposal, ProcurementProposal } from "./proposals";
import type {
  FinanceApproval,
  PurchaseOrder,
  PurchaseRequest,
  ReceivingAllocation,
} from "./sandbox";

/**
 * The deterministic authorization gate. A model proposal is advice; nothing
 * mutates the sandbox business system unless the matching gate returns
 * `allowed: true`. No gate consults a model.
 */
export type GateResult =
  | { allowed: true; consulted: TruthVersionRef[] }
  | { allowed: false; code: string; message: string; reasons: string[] };

const deny = (code: string, message: string, reasons: string[] = [code]): GateResult => ({
  allowed: false,
  code,
  message,
  reasons,
});

export function authorizeProcurement(input: {
  proposal: ProcurementProposal;
  request: PurchaseRequest;
  assertions: readonly TruthAssertion[];
  policy: ProcurementPolicyValue;
  asOf: string;
  existingPo: PurchaseOrder | undefined;
}): GateResult {
  const { proposal, request, policy } = input;
  if (proposal.decision !== "SELECT_SUPPLIER") {
    return deny("MODEL_DECLINED", "The model did not propose selecting the supplier.");
  }
  if (proposal.target !== request.supplierId) {
    return deny("TARGET_MISMATCH", "Proposal targets a supplier other than the requested one.");
  }
  if (input.existingPo) return deny("PO_ALREADY_EXISTS", `${request.poId} already exists.`);

  const eligibility = evaluateSupplierEligibility({
    assertions: input.assertions,
    supplierId: request.supplierId,
    policy,
    asOf: input.asOf,
  });
  if (!eligibility.eligible) {
    return deny(
      "SUPPLIER_INELIGIBLE",
      "Supplier is not eligible under authoritative truth.",
      eligibility.reasons,
    );
  }
  if (request.currency !== policy.currency) {
    return deny("CURRENCY_NOT_PERMITTED", "Request currency differs from procurement policy.");
  }
  if (request.amountCents > policy.maxPoAmountCents) {
    return deny("AMOUNT_EXCEEDS_POLICY", "Request amount exceeds the procurement policy maximum.");
  }
  return { allowed: true, consulted: eligibility.consulted };
}

export function authorizeFinance(input: {
  proposal: FinanceProposal;
  po: PurchaseOrder | undefined;
  existingApproval: FinanceApproval | undefined;
  /** The truth context the PO was created under (resolved from persisted assertions). */
  contextAssertions: readonly TruthAssertion[];
  policy: ProcurementPolicyValue;
  asOf: string;
}): GateResult {
  const { proposal, po, policy } = input;
  if (proposal.decision !== "APPROVE_PO") {
    return deny("MODEL_DECLINED", "The model did not propose approving the PO.");
  }
  if (!po) return deny("PO_NOT_FOUND", "Purchase order does not exist.");
  if (proposal.target !== po.poId)
    return deny("TARGET_MISMATCH", "Proposal targets a different PO.");
  if (po.status !== "CREATED" || input.existingApproval) {
    return deny(
      "PO_NOT_APPROVABLE",
      `PO is in state ${po.status}; only CREATED POs can be approved.`,
    );
  }
  if (po.currency !== policy.currency) {
    return deny("CURRENCY_NOT_PERMITTED", "PO currency differs from procurement policy.");
  }
  if (po.amountCents > policy.maxPoAmountCents) {
    return deny("AMOUNT_EXCEEDS_POLICY", "PO amount exceeds the finance policy maximum.");
  }
  const eligibility = evaluateSupplierEligibility({
    assertions: input.contextAssertions,
    supplierId: po.supplierId,
    policy,
    asOf: input.asOf,
  });
  if (!eligibility.eligible) {
    return deny(
      "SUPPLIER_INELIGIBLE",
      "Supplier is not eligible in the decision context.",
      eligibility.reasons,
    );
  }
  return { allowed: true, consulted: eligibility.consulted };
}

export function authorizeOperations(input: {
  proposal: OperationsProposal;
  po: PurchaseOrder | undefined;
  approval: FinanceApproval | undefined;
  existingAllocation: ReceivingAllocation | undefined;
}): GateResult {
  const { proposal, po } = input;
  if (proposal.decision !== "SCHEDULE_RECEIVING") {
    return deny("MODEL_DECLINED", "The model did not propose scheduling receiving.");
  }
  if (!po) return deny("PO_NOT_FOUND", "Purchase order does not exist.");
  if (proposal.target !== po.poId)
    return deny("TARGET_MISMATCH", "Proposal targets a different PO.");
  if (!input.approval) return deny("FINANCE_APPROVAL_MISSING", "Finance has not approved this PO.");
  if (po.status !== "APPROVED" || input.existingAllocation) {
    return deny(
      "PO_NOT_READY_FOR_RECEIVING",
      `PO is in state ${po.status}; it must be APPROVED and unallocated.`,
    );
  }
  return { allowed: true, consulted: [] };
}
