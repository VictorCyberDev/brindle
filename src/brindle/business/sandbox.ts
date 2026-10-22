import { z } from "zod";
import { idSchema, isoTimestampSchema } from "../common/schemas";

/**
 * SANDBOX BUSINESS SYSTEM. These records live in Brindle's own PostgreSQL
 * tables. Nothing here is a real purchase order, payment or email.
 */
export const PO_STATUSES = ["CREATED", "APPROVED", "RECEIVING_SCHEDULED"] as const;
export const poStatusSchema = z.enum(PO_STATUSES);
export type PoStatus = z.infer<typeof poStatusSchema>;

const currencySchema = z.string().regex(/^[A-Z]{3}$/);

export const purchaseOrderSchema = z.strictObject({
  poId: idSchema,
  supplierId: idSchema,
  supplierName: z.string().min(1),
  description: z.string().min(1),
  amountCents: z.number().int().positive(),
  currency: currencySchema,
  status: poStatusSchema,
  createdByDecisionId: idSchema,
  createdAt: isoTimestampSchema,
});
export type PurchaseOrder = z.infer<typeof purchaseOrderSchema>;

export const financeApprovalSchema = z.strictObject({
  approvalId: idSchema,
  poId: idSchema,
  approvedAmountCents: z.number().int().positive(),
  currency: currencySchema,
  decisionId: idSchema,
  approvedAt: isoTimestampSchema,
});
export type FinanceApproval = z.infer<typeof financeApprovalSchema>;

export const receivingAllocationSchema = z.strictObject({
  allocationId: idSchema,
  poId: idSchema,
  dockId: idSchema,
  expectedArrival: isoTimestampSchema,
  decisionId: idSchema,
  createdAt: isoTimestampSchema,
});
export type ReceivingAllocation = z.infer<typeof receivingAllocationSchema>;

/** A sandbox record of "supplier was told". No message is ever transmitted. */
export const supplierNotificationSchema = z.strictObject({
  notificationId: idSchema,
  poId: idSchema,
  supplierId: idSchema,
  channel: z.literal("SANDBOX_RECORD"),
  subject: z.string().min(1),
  decisionId: idSchema,
  recordedAt: isoTimestampSchema,
});
export type SupplierNotification = z.infer<typeof supplierNotificationSchema>;

/** What a purchase request asks for; the fixed input of a demo transaction. */
export interface PurchaseRequest {
  poId: string;
  supplierId: string;
  description: string;
  amountCents: number;
  currency: string;
}
