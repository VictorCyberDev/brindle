import { createHash } from "node:crypto";
import { z } from "zod";
import { FACT_KEYS } from "../../brindle/business/eligibility";
import type { TruthAssertion } from "../../brindle/truth/assertion";
import { truthAssertionSchema } from "../../brindle/truth/assertion";

/**
 * Row shapes of the three minimal M1 truth tables. Zetaris returns JSON
 * records; column names are matched case-insensitively and every value is
 * parsed strictly (fail closed: an unparseable truth row is an error, never a guess).
 */
export const TRUTH_TABLES = {
  supplierMaster: "supplier_master",
  supplierCertifications: "supplier_certifications",
  procurementPolicy: "procurement_policy",
} as const;
export type TruthTable = (typeof TRUTH_TABLES)[keyof typeof TRUTH_TABLES];

export type RawRow = Record<string, unknown>;

export class TruthNormalizationError extends Error {
  override name = "TruthNormalizationError";
}

const lowerKeys = (row: RawRow): RawRow =>
  Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase(), v]));

const boolean = z.union([
  z.boolean(),
  z.literal("true").transform(() => true),
  z.literal("TRUE").transform(() => true),
  z.literal("false").transform(() => false),
  z.literal("FALSE").transform(() => false),
]);

const integer = z.union([
  z.number().int(),
  z
    .string()
    .regex(/^[0-9]+$/)
    .transform(Number),
]);

/** Accepts ISO 8601, or "YYYY-MM-DD[ T]HH:MM:SS" which is interpreted as UTC. */
const timestamp = z.string().transform((raw, ctx) => {
  const s = raw.trim().replace(" ", "T");
  const withZone = /(Z|[+-][0-9]{2}:?[0-9]{2})$/.test(s) ? s : `${s}Z`;
  const date = new Date(withZone);
  if (Number.isNaN(date.getTime())) {
    ctx.addIssue({ code: "custom", message: `unparseable timestamp "${raw}"` });
    return z.NEVER;
  }
  return date.toISOString();
});

const nullableTimestamp = z.union([z.null(), z.literal(""), timestamp]).transform((v) => v || null);

const supplierMasterRow = z.object({
  supplier_id: z.string().min(1),
  legal_name: z.string().min(1),
  enabled: boolean,
  approval_status: z.string().min(1),
  updated_at: timestamp,
});

const certificationRow = z.object({
  certification_id: z.string().min(1),
  supplier_id: z.string().min(1),
  certification_type: z.string().min(1),
  status: z.string().min(1),
  valid_from: timestamp,
  valid_to: nullableTimestamp,
});

const policyRow = z.object({
  policy_id: z.string().min(1),
  policy_version: z.string().min(1),
  required_certification_type: z.string().min(1),
  max_po_amount_cents: integer,
  currency: z.string().regex(/^[A-Z]{3}$/),
  effective_from: timestamp,
});

function parseRow<S extends z.ZodType>(schema: S, row: RawRow, label: string): z.output<S> {
  const parsed = schema.safeParse(lowerKeys(row));
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new TruthNormalizationError(`${label} row is not a valid truth row: ${detail}`);
  }
  return parsed.data;
}

export interface NormalizationContext {
  /** "zetaris" for live reads; a mock source must use a visibly different id. */
  sourceId: string;
  /** When Brindle read the data (observed time). */
  observedAt: string;
  /** Schema used, for provenance (never credentials). */
  schema: string;
}

/** Stable identity of a logical fact. Independent of version, time and value. */
export function assertionIdFor(
  sourceId: string,
  entityType: string,
  entityId: string,
  factKey: string,
): string {
  const digest = createHash("sha256")
    .update(JSON.stringify(["brindle:assertion:v1", sourceId, entityType, entityId, factKey]))
    .digest("hex");
  return `ta_${digest.slice(0, 24)}`;
}

function assertion(
  ctx: NormalizationContext,
  fields: {
    entityType: string;
    entityId: string;
    factKey: string;
    value: TruthAssertion["value"];
    validFrom: string;
    validTo: string | null;
    sourceRecordRef: string;
  },
): TruthAssertion {
  const assertionId = assertionIdFor(
    ctx.sourceId,
    fields.entityType,
    fields.entityId,
    fields.factKey,
  );
  return truthAssertionSchema.parse({
    truthVersionId: `${assertionId}@v1`,
    assertionId,
    version: 1,
    subject: { entityType: fields.entityType, entityId: fields.entityId },
    sourceId: ctx.sourceId,
    factKey: fields.factKey,
    value: fields.value,
    validFrom: fields.validFrom,
    validTo: fields.validTo,
    observedAt: ctx.observedAt,
    provenance: {
      recordedBy: "brindle.zetaris-normalizer",
      sourceRecordRef: fields.sourceRecordRef,
    },
  });
}

export function normalizeSupplierMaster(
  rows: readonly RawRow[],
  ctx: NormalizationContext,
): TruthAssertion[] {
  return rows.flatMap((raw) => {
    const r = parseRow(supplierMasterRow, raw, TRUTH_TABLES.supplierMaster);
    const ref = `${ctx.schema}.${TRUTH_TABLES.supplierMaster}#${r.supplier_id}`;
    const base = {
      entityType: "supplier",
      entityId: r.supplier_id,
      validFrom: r.updated_at,
      validTo: null,
      sourceRecordRef: ref,
    };
    return [
      assertion(ctx, { ...base, factKey: FACT_KEYS.supplierLegalName, value: r.legal_name }),
      assertion(ctx, { ...base, factKey: FACT_KEYS.supplierEnabled, value: r.enabled }),
      assertion(ctx, {
        ...base,
        factKey: FACT_KEYS.supplierApprovalStatus,
        value: r.approval_status,
      }),
    ];
  });
}

export function normalizeCertifications(
  rows: readonly RawRow[],
  ctx: NormalizationContext,
): TruthAssertion[] {
  return rows.map((raw) => {
    const r = parseRow(certificationRow, raw, TRUTH_TABLES.supplierCertifications);
    return assertion(ctx, {
      entityType: "supplier",
      entityId: r.supplier_id,
      factKey: FACT_KEYS.certification(r.certification_type),
      value: {
        certificationId: r.certification_id,
        certificationType: r.certification_type,
        status: r.status,
      },
      validFrom: r.valid_from,
      validTo: r.valid_to,
      sourceRecordRef: `${ctx.schema}.${TRUTH_TABLES.supplierCertifications}#${r.certification_id}`,
    });
  });
}

export function normalizePolicy(
  rows: readonly RawRow[],
  ctx: NormalizationContext,
): TruthAssertion[] {
  return rows.map((raw) => {
    const r = parseRow(policyRow, raw, TRUTH_TABLES.procurementPolicy);
    return assertion(ctx, {
      entityType: "policy",
      entityId: r.policy_id,
      factKey: FACT_KEYS.procurementPolicy,
      value: {
        policyVersion: r.policy_version,
        requiredCertificationType: r.required_certification_type,
        maxPoAmountCents: r.max_po_amount_cents,
        currency: r.currency,
      },
      validFrom: r.effective_from,
      validTo: null,
      sourceRecordRef: `${ctx.schema}.${TRUTH_TABLES.procurementPolicy}#${r.policy_id}`,
    });
  });
}
