import type { PurchaseRequest } from "../brindle/business/sandbox";

export interface DemoTransaction {
  request: PurchaseRequest;
  /** Display only. */
  supplierName: string;
  role: "PRIMARY" | "CONTROL";
}

/**
 * The two locked transactions. PO-901 shares NO supplier, truth assertion,
 * decision or sandbox row with PO-827; it only shares the (global) procurement policy.
 */
export const DEMO_TRANSACTIONS: readonly DemoTransaction[] = [
  {
    role: "PRIMARY",
    supplierName: "Atlas Components",
    request: {
      poId: "PO-827",
      supplierId: "SUP-ATLAS",
      description: "Precision bearings, grade 5 (qty 2,000)",
      amountCents: 4_800_000,
      currency: "USD",
    },
  },
  {
    role: "CONTROL",
    supplierName: "Borealis Fasteners",
    request: {
      poId: "PO-901",
      supplierId: "SUP-BOREAL",
      description: "M8 stainless fasteners (qty 50,000)",
      amountCents: 1_250_000,
      currency: "USD",
    },
  },
];
