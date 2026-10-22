import { describe, expect, it } from "vitest";
import { ZETARIS_SEED } from "../demo/seed-data";
import {
  assertionIdFor,
  normalizeCertifications,
  normalizeSupplierMaster,
  TruthNormalizationError,
} from "./zetaris/rows";

describe("truth normalization", () => {
  const ctx = { sourceId: "zetaris", observedAt: "2026-10-22T00:00:00Z", schema: "s" };

  it("maps Zetaris-style rows (any key case, string booleans, UTC timestamps) to TruthAssertions", () => {
    const [enabled] = normalizeSupplierMaster(
      [
        {
          SUPPLIER_ID: "SUP-ATLAS",
          LEGAL_NAME: "Atlas Components",
          ENABLED: "TRUE",
          APPROVAL_STATUS: "APPROVED",
          UPDATED_AT: "2025-01-15 00:00:00",
        },
      ],
      ctx,
    ).filter((a) => a.factKey === "supplier.enabled");
    expect(enabled).toMatchObject({
      value: true,
      validFrom: "2025-01-15T00:00:00.000Z",
      validTo: null,
      observedAt: ctx.observedAt,
      sourceId: "zetaris",
    });
    expect(enabled!.provenance.sourceRecordRef).toBe("s.supplier_master#SUP-ATLAS");
  });

  it("derives certification valid time from the row, keeping observed time separate", () => {
    const [cert] = normalizeCertifications([ZETARIS_SEED.supplier_certifications[0]], ctx);
    expect(cert).toMatchObject({
      factKey: "certification.ISO-9001",
      validFrom: "2025-01-15T00:00:00.000Z",
      validTo: "2030-01-14T00:00:00.000Z",
    });
    expect(cert!.observedAt).toBe(ctx.observedAt);
    expect(cert!.value).toEqual({
      certificationId: "CERT-ATLAS-9001",
      certificationType: "ISO-9001",
      status: "VALID",
    });
  });

  it("assigns stable, source-scoped assertion identities", () => {
    const a = assertionIdFor("zetaris", "supplier", "SUP-ATLAS", "supplier.enabled");
    expect(a).toBe(assertionIdFor("zetaris", "supplier", "SUP-ATLAS", "supplier.enabled"));
    expect(a).not.toBe(
      assertionIdFor("MOCK:zetaris-fixture", "supplier", "SUP-ATLAS", "supplier.enabled"),
    );
    expect(a).not.toBe(assertionIdFor("zetaris", "supplier", "SUP-BOREAL", "supplier.enabled"));
  });

  it("fails closed on rows it cannot parse", () => {
    const bad = {
      supplier_id: "S",
      legal_name: "n",
      enabled: "maybe",
      approval_status: "APPROVED",
      updated_at: "2025-01-01",
    };
    expect(() => normalizeSupplierMaster([bad], ctx)).toThrow(TruthNormalizationError);
    expect(() =>
      normalizeSupplierMaster([{ ...bad, enabled: "true", updated_at: "garbage" }], ctx),
    ).toThrow(TruthNormalizationError);
    expect(() => normalizeCertifications([{ certification_id: "c" }], ctx)).toThrow(
      TruthNormalizationError,
    );
  });
});
