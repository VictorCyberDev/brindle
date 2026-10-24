import { z } from "zod";
import { and, eq, like, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import * as t from "../db/schema";
export const VERIFIER_SOURCE = "sandbox.postgres.independent-verifier.v1";
export class FreshReadFailed extends Error {
  override name = "FreshReadFailed";
}
/** Independent read boundary: no executor results, in-memory plans or status payloads are accepted. */
export async function readFreshRecoveryState(db: Db, incidentId: string) {
  try {
    const clockResult = await db.execute(sql`SELECT clock_timestamp()::text AS now`);
    const clockRows = Array.isArray(clockResult)
      ? clockResult
      : (clockResult as { rows: unknown }).rows;
    const [clock] = z.array(z.object({ now: z.string() })).parse(clockRows);
    const observedAt = new Date(clock!.now).toISOString();
    const pos = await db.select().from(t.purchaseOrders).orderBy(t.purchaseOrders.id).for("share");
    const finance = await db
      .select()
      .from(t.financeApprovals)
      .orderBy(t.financeApprovals.id)
      .for("share");
    const receiving = await db
      .select()
      .from(t.receivingAllocations)
      .orderBy(t.receivingAllocations.id)
      .for("share");
    const notifications = await db
      .select()
      .from(t.supplierNotifications)
      .orderBy(t.supplierNotifications.id)
      .for("share");
    const controlReceipts = await db
      .select()
      .from(t.decisionReceipts)
      .where(like(t.decisionReceipts.id, "dec:PO-901:%"))
      .orderBy(t.decisionReceipts.id);
    const evidence = await db
      .select()
      .from(t.recoveryEvidence)
      .where(eq(t.recoveryEvidence.incidentId, incidentId))
      .orderBy(t.recoveryEvidence.id);
    const steps = await db
      .select()
      .from(t.recoverySteps)
      .where(eq(t.recoverySteps.incidentId, incidentId))
      .orderBy(t.recoverySteps.id);
    const assessments = await db
      .select()
      .from(t.counterfactualAssessments)
      .innerJoin(
        t.incidents,
        and(
          eq(t.incidents.id, incidentId),
          eq(t.incidents.revisionId, t.counterfactualAssessments.revisionId),
        ),
      );
    const state = JSON.parse(
      JSON.stringify({
        pos,
        finance,
        receiving,
        notifications,
        controlReceipts,
        evidence,
        steps,
        assessments,
      }),
    ) as {
      pos: (typeof t.purchaseOrders.$inferSelect)[];
      finance: (typeof t.financeApprovals.$inferSelect)[];
      receiving: (typeof t.receivingAllocations.$inferSelect)[];
      notifications: (typeof t.supplierNotifications.$inferSelect)[];
      controlReceipts: (typeof t.decisionReceipts.$inferSelect)[];
      evidence: (typeof t.recoveryEvidence.$inferSelect)[];
      steps: (typeof t.recoverySteps.$inferSelect)[];
      assessments: unknown[];
    };
    return {
      ...state,
      observation: { kind: "FRESH_INDEPENDENT_READ" as const, source: VERIFIER_SOURCE, observedAt },
    };
  } catch {
    throw new FreshReadFailed("Fresh independent database read failed");
  }
}
export type FreshState = Awaited<ReturnType<typeof readFreshRecoveryState>>;
