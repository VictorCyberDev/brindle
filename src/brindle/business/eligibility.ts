import { z } from "zod";
import { toEpochMs } from "../common/schemas";
import type { TruthAssertion, TruthVersionRef } from "../truth/assertion";

/** Fact keys of the minimal M1 authoritative truth model (supplier_master, supplier_certifications, procurement_policy). */
export const FACT_KEYS = {
  supplierLegalName: "supplier.legal_name",
  supplierEnabled: "supplier.enabled",
  supplierApprovalStatus: "supplier.approval_status",
  procurementPolicy: "policy.procurement",
  certification: (certificationType: string) => `certification.${certificationType}`,
} as const;

export const certificationValueSchema = z.strictObject({
  certificationId: z.string().min(1),
  certificationType: z.string().min(1),
  status: z.string().min(1),
});
export type CertificationValue = z.infer<typeof certificationValueSchema>;

export const procurementPolicyValueSchema = z.strictObject({
  policyVersion: z.string().min(1),
  requiredCertificationType: z.string().min(1),
  maxPoAmountCents: z.number().int().positive(),
  currency: z.string().regex(/^[A-Z]{3}$/),
});
export type ProcurementPolicyValue = z.infer<typeof procurementPolicyValueSchema>;

export interface EligibilityResult {
  eligible: boolean;
  /** Stable machine codes; empty when eligible. */
  reasons: string[];
  /** The exact truth versions that were consulted. */
  consulted: TruthVersionRef[];
}

const refOf = (a: TruthAssertion): TruthVersionRef => ({
  assertionId: a.assertionId,
  version: a.version,
});

function isValidAt(a: TruthAssertion, asOf: string): boolean {
  const t = toEpochMs(asOf);
  return toEpochMs(a.validFrom) <= t && (a.validTo === null || t < toEpochMs(a.validTo));
}

export function findAssertion(
  assertions: readonly TruthAssertion[],
  entity: { entityType: string; entityId: string },
  factKey: string,
): TruthAssertion | undefined {
  return assertions.find(
    (a) =>
      a.subject.entityType === entity.entityType &&
      a.subject.entityId === entity.entityId &&
      a.factKey === factKey,
  );
}

/**
 * Deterministic supplier eligibility from NORMALIZED truth only. Anything
 * missing, malformed, outside its valid interval or not exactly as required
 * makes the supplier ineligible: unknown is never treated as fine.
 */
export function evaluateSupplierEligibility(input: {
  assertions: readonly TruthAssertion[];
  supplierId: string;
  policy: ProcurementPolicyValue;
  asOf: string;
}): EligibilityResult {
  const { assertions, supplierId, policy, asOf } = input;
  const supplier = { entityType: "supplier", entityId: supplierId };
  const reasons: string[] = [];
  const consulted: TruthVersionRef[] = [];

  const enabled = findAssertion(assertions, supplier, FACT_KEYS.supplierEnabled);
  if (!enabled) reasons.push("SUPPLIER_NOT_FOUND");
  else {
    consulted.push(refOf(enabled));
    if (enabled.value !== true || !isValidAt(enabled, asOf)) reasons.push("SUPPLIER_DISABLED");
  }

  const approval = findAssertion(assertions, supplier, FACT_KEYS.supplierApprovalStatus);
  if (!approval) reasons.push("SUPPLIER_APPROVAL_MISSING");
  else {
    consulted.push(refOf(approval));
    if (approval.value !== "APPROVED" || !isValidAt(approval, asOf)) {
      reasons.push("SUPPLIER_NOT_APPROVED");
    }
  }

  const cert = findAssertion(
    assertions,
    supplier,
    FACT_KEYS.certification(policy.requiredCertificationType),
  );
  if (!cert) reasons.push("CERTIFICATION_MISSING");
  else {
    consulted.push(refOf(cert));
    const parsed = certificationValueSchema.safeParse(cert.value);
    if (!parsed.success) reasons.push("CERTIFICATION_MALFORMED");
    else if (parsed.data.status !== "VALID") reasons.push("CERTIFICATION_NOT_VALID");
    if (!isValidAt(cert, asOf)) reasons.push("CERTIFICATION_OUTSIDE_VALID_INTERVAL");
  }

  return { eligible: reasons.length === 0, reasons, consulted };
}
