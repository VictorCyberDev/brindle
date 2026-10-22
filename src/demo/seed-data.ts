import type { RawRow } from "../integrations/zetaris/rows";

/**
 * The smallest deterministic AUTHORITATIVE-TRUTH seed for M1: what must exist
 * in Zetaris. data/zetaris-seed/*.csv are generated from this and checked by a
 * test. This is truth seed data, deliberately separate from the sandbox
 * business system (which is written only by gated executors).
 */
export const ZETARIS_SEED = {
  supplier_master: [
    {
      supplier_id: "SUP-ATLAS",
      legal_name: "Atlas Components",
      enabled: "true",
      approval_status: "APPROVED",
      updated_at: "2025-01-15T00:00:00Z",
    },
    {
      supplier_id: "SUP-BOREAL",
      legal_name: "Borealis Fasteners",
      enabled: "true",
      approval_status: "APPROVED",
      updated_at: "2025-02-01T00:00:00Z",
    },
  ],
  supplier_certifications: [
    {
      certification_id: "CERT-ATLAS-9001",
      supplier_id: "SUP-ATLAS",
      certification_type: "ISO-9001",
      status: "VALID",
      valid_from: "2025-01-15T00:00:00Z",
      valid_to: "2030-01-14T00:00:00Z",
    },
    {
      certification_id: "CERT-BOREAL-9001",
      supplier_id: "SUP-BOREAL",
      certification_type: "ISO-9001",
      status: "VALID",
      valid_from: "2025-02-01T00:00:00Z",
      valid_to: "2030-01-31T00:00:00Z",
    },
  ],
  procurement_policy: [
    {
      policy_id: "POL-PROC-001",
      policy_version: "proc-policy-v1",
      required_certification_type: "ISO-9001",
      max_po_amount_cents: "5000000",
      currency: "USD",
      effective_from: "2025-01-01T00:00:00Z",
    },
  ],
} as const satisfies Record<string, readonly RawRow[]>;

export const POLICY_ID = "POL-PROC-001";

export function seedToCsv(table: keyof typeof ZETARIS_SEED): string {
  const rows = ZETARIS_SEED[table] as readonly RawRow[];
  const columns = Object.keys(rows[0]!);
  const lines = rows.map((r) => columns.map((c) => String(r[c])).join(","));
  return [columns.join(","), ...lines].join("\n") + "\n";
}
