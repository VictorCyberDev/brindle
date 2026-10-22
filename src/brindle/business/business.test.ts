import { describe, expect, it } from "vitest";
import { authorizeFinance, authorizeOperations, authorizeProcurement } from "./authorization";
import { evaluateSupplierEligibility, type ProcurementPolicyValue } from "./eligibility";
import type { FinanceProposal, OperationsProposal, ProcurementProposal } from "./proposals";
import type { FinanceApproval, PurchaseOrder, ReceivingAllocation } from "./sandbox";
import type { TruthAssertion } from "../truth/assertion";

const ASOF = "2026-10-22T12:00:00Z";
const policy: ProcurementPolicyValue = {
  policyVersion: "proc-policy-v1",
  requiredCertificationType: "ISO-9001",
  maxPoAmountCents: 5_000_000,
  currency: "USD",
};

function truth(
  overrides: {
    enabled?: unknown;
    approval?: unknown;
    certStatus?: string;
    certFrom?: string;
    certTo?: string | null;
    omitCert?: boolean;
  } = {},
): TruthAssertion[] {
  const base = (
    factKey: string,
    value: TruthAssertion["value"],
    validFrom: string,
    validTo: string | null,
    n: number,
  ): TruthAssertion => ({
    truthVersionId: `a${n}@v1`,
    assertionId: `a${n}`,
    version: 1,
    subject: { entityType: "supplier", entityId: "SUP-ATLAS" },
    sourceId: "zetaris",
    factKey,
    value,
    validFrom,
    validTo,
    observedAt: ASOF,
    provenance: { recordedBy: "test" },
  });
  const out = [
    base(
      "supplier.enabled",
      (overrides.enabled ?? true) as TruthAssertion["value"],
      "2025-01-01T00:00:00Z",
      null,
      1,
    ),
    base(
      "supplier.approval_status",
      (overrides.approval ?? "APPROVED") as TruthAssertion["value"],
      "2025-01-01T00:00:00Z",
      null,
      2,
    ),
  ];
  if (!overrides.omitCert) {
    out.push(
      base(
        "certification.ISO-9001",
        {
          certificationId: "C1",
          certificationType: "ISO-9001",
          status: overrides.certStatus ?? "VALID",
        },
        overrides.certFrom ?? "2025-01-01T00:00:00Z",
        overrides.certTo === undefined ? "2030-01-01T00:00:00Z" : overrides.certTo,
        3,
      ),
    );
  }
  return out;
}

const request = {
  poId: "PO-827",
  supplierId: "SUP-ATLAS",
  description: "x",
  amountCents: 4_800_000,
  currency: "USD",
};
const procProposal = (over: Partial<ProcurementProposal> = {}): ProcurementProposal => ({
  decision: "SELECT_SUPPLIER",
  target: "SUP-ATLAS",
  rationale: { summary: "s", factors: [{ factor: "f", evidenceIds: ["ev-1"] }] },
  confidence: 0.9,
  ...over,
});
const procurement = (
  assertions: TruthAssertion[],
  over: Partial<Parameters<typeof authorizeProcurement>[0]> = {},
) =>
  authorizeProcurement({
    proposal: procProposal(),
    request,
    assertions,
    policy,
    asOf: ASOF,
    existingPo: undefined,
    ...over,
  });

describe("supplier eligibility from normalized truth", () => {
  it("permits Atlas: enabled, APPROVED, certification VALID within its interval", () => {
    const r = evaluateSupplierEligibility({
      assertions: truth(),
      supplierId: "SUP-ATLAS",
      policy,
      asOf: ASOF,
    });
    expect(r).toMatchObject({ eligible: true, reasons: [] });
    expect(r.consulted).toHaveLength(3);
    expect(procurement(truth())).toMatchObject({ allowed: true });
  });

  it("treats anything unknown as ineligible", () => {
    expect(
      evaluateSupplierEligibility({ assertions: [], supplierId: "SUP-ATLAS", policy, asOf: ASOF })
        .reasons,
    ).toContain("SUPPLIER_NOT_FOUND");
    expect(procurement(truth({ omitCert: true }))).toMatchObject({ allowed: false });
    expect(procurement(truth({ enabled: "true" }))).toMatchObject({ allowed: false }); // wrong type is not "enabled"
    expect(procurement(truth({ approval: "PENDING" }))).toMatchObject({ allowed: false });
  });

  it("respects the certification valid interval at the decision time", () => {
    expect(procurement(truth({ certTo: "2026-10-22T12:00:00Z" }))).toMatchObject({
      allowed: false,
    }); // end is exclusive
    expect(procurement(truth({ certFrom: "2026-10-22T12:00:01Z" }))).toMatchObject({
      allowed: false,
    });
    expect(procurement(truth({ certTo: null }))).toMatchObject({ allowed: true });
  });
});

describe("procurement gate", () => {
  it("rejects declines, wrong targets, duplicate POs, currency and amount violations", () => {
    expect(
      procurement(truth(), { proposal: procProposal({ decision: "DECLINE_SUPPLIER" }) }),
    ).toMatchObject({ code: "MODEL_DECLINED" });
    expect(procurement(truth(), { proposal: procProposal({ target: "SUP-OTHER" }) })).toMatchObject(
      { code: "TARGET_MISMATCH" },
    );
    expect(procurement(truth(), { request: { ...request, amountCents: 5_000_001 } })).toMatchObject(
      { code: "AMOUNT_EXCEEDS_POLICY" },
    );
    expect(procurement(truth(), { request: { ...request, currency: "EUR" } })).toMatchObject({
      code: "CURRENCY_NOT_PERMITTED",
    });
  });
});

const po = (over: Partial<PurchaseOrder> = {}): PurchaseOrder => ({
  poId: "PO-827",
  supplierId: "SUP-ATLAS",
  supplierName: "Atlas Components",
  description: "x",
  amountCents: 4_800_000,
  currency: "USD",
  status: "CREATED",
  createdByDecisionId: "d",
  createdAt: ASOF,
  ...over,
});
const approval: FinanceApproval = {
  approvalId: "a",
  poId: "PO-827",
  approvedAmountCents: 4_800_000,
  currency: "USD",
  decisionId: "d",
  approvedAt: ASOF,
};
const allocation: ReceivingAllocation = {
  allocationId: "r",
  poId: "PO-827",
  dockId: "DOCK-3",
  expectedArrival: ASOF,
  decisionId: "d",
  createdAt: ASOF,
};
const finProposal = (over: Partial<FinanceProposal> = {}): FinanceProposal => ({
  decision: "APPROVE_PO",
  target: "PO-827",
  rationale: { summary: "s", factors: [{ factor: "f", evidenceIds: ["ev-1"] }] },
  confidence: 0.9,
  ...over,
});
const finance = (over: Partial<Parameters<typeof authorizeFinance>[0]> = {}) =>
  authorizeFinance({
    proposal: finProposal(),
    po: po(),
    existingApproval: undefined,
    contextAssertions: truth(),
    policy,
    asOf: ASOF,
    ...over,
  });

describe("finance gate", () => {
  it("approves a CREATED PO within policy for an eligible supplier", () => {
    expect(finance()).toMatchObject({ allowed: true });
  });
  it("cannot approve a nonexistent or unapprovable PO", () => {
    expect(finance({ po: undefined })).toMatchObject({ allowed: false, code: "PO_NOT_FOUND" });
    expect(finance({ po: po({ status: "APPROVED" }) })).toMatchObject({
      code: "PO_NOT_APPROVABLE",
    });
    expect(finance({ po: po({ status: "RECEIVING_SCHEDULED" }) })).toMatchObject({
      code: "PO_NOT_APPROVABLE",
    });
    expect(finance({ existingApproval: approval })).toMatchObject({ code: "PO_NOT_APPROVABLE" });
  });
  it("enforces amount, currency and supplier eligibility in the decision context", () => {
    expect(finance({ po: po({ amountCents: 9_000_000 }) })).toMatchObject({
      code: "AMOUNT_EXCEEDS_POLICY",
    });
    expect(finance({ po: po({ currency: "EUR" }) })).toMatchObject({
      code: "CURRENCY_NOT_PERMITTED",
    });
    expect(finance({ contextAssertions: truth({ certStatus: "REVOKED" }) })).toMatchObject({
      code: "SUPPLIER_INELIGIBLE",
    });
    expect(finance({ proposal: finProposal({ decision: "REJECT_PO" }) })).toMatchObject({
      code: "MODEL_DECLINED",
    });
  });
});

const opsProposal = (over: Partial<OperationsProposal> = {}): OperationsProposal => ({
  decision: "SCHEDULE_RECEIVING",
  target: "PO-827",
  rationale: { summary: "s", factors: [{ factor: "f", evidenceIds: ["ev-1"] }] },
  confidence: 0.9,
  ...over,
});
const operations = (over: Partial<Parameters<typeof authorizeOperations>[0]> = {}) =>
  authorizeOperations({
    proposal: opsProposal(),
    po: po({ status: "APPROVED" }),
    approval,
    existingAllocation: undefined,
    ...over,
  });

describe("operations gate", () => {
  it("allocates receiving for an APPROVED PO that has a finance approval", () => {
    expect(operations()).toMatchObject({ allowed: true });
  });
  it("cannot allocate before finance approval", () => {
    expect(operations({ approval: undefined })).toMatchObject({ code: "FINANCE_APPROVAL_MISSING" });
    expect(operations({ po: po({ status: "CREATED" }), approval: undefined })).toMatchObject({
      code: "FINANCE_APPROVAL_MISSING",
    });
    expect(operations({ po: po({ status: "CREATED" }) })).toMatchObject({
      code: "PO_NOT_READY_FOR_RECEIVING",
    });
    expect(operations({ po: undefined })).toMatchObject({ code: "PO_NOT_FOUND" });
    expect(operations({ existingAllocation: allocation })).toMatchObject({
      code: "PO_NOT_READY_FOR_RECEIVING",
    });
  });
});
