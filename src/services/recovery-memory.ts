import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import * as t from "../db/schema";
import {
  HMEM,
  type LedgerEntry,
  type MemoryRecord,
  type QueryResult,
} from "../integrations/hmem/engine";
import type { MeterlessRecoveryMemory, RecoveryMemoryEntry } from "../integrations/meterless";
import type { MemoryRef } from "../brindle/memory/memory-ref";
import { recoveryReceiptSchema } from "../brindle/receipts/recovery-receipt";
import { validateReceiptEvidence } from "./verification";
import { readRecovery } from "./recovery";
import { canonical, fingerprint } from "./evidence";

export const HMEM_UPSTREAM_SHA = "1742dec56a66e58eef9dda2d2b865823758ca8cd";
export const HMEM_ENGINE_STATUS = "ACTUAL_LOCAL_SPEC_ENGINE";
const STATE_ID = "brindle-recovery-hmem.v1";
export interface VerifiedExperience {
  incidentId: string;
  receiptId: string;
  revisionId: string;
  factKey: string;
  correctedStatus: string;
  targetTypes: string[];
  changedDecisions: string[];
  preservedDecisions: string[];
  successfulCapabilities: string[];
  failedCompensators: { capabilityId: string; code: string; preconditionFingerprint: string }[];
  irreversiblePattern: string;
  verification: { id: string; status: "PASS" }[];
  verdict: "RECOVERED";
  traceId: string;
}
export interface MemoryQuery {
  factKey: string;
  correctedStatus: string;
  targetTypes: readonly string[];
  excludeIncidentId?: string;
}
export interface MemoryAdvisory {
  engine: typeof HMEM_ENGINE_STATUS;
  upstreamSha: string;
  query: MemoryQuery;
  matches: {
    memoryId: string;
    relevance: number;
    experience: VerifiedExperience;
    warnings: string[];
  }[];
  trace: QueryResult["trace"];
  authority: "ADVISORY_ONLY";
  context: string;
}
interface StatePayload {
  records: MemoryRecord[];
  seq: number;
  lastAdvisory: MemoryAdvisory | null;
}

/** Promotion is grounded in real invariant-backed closure, never in executor success or model claims. */
export async function verifiedExperience(db: Db, incidentId: string): Promise<VerifiedExperience> {
  const [incident] = await db.select().from(t.incidents).where(eq(t.incidents.id, incidentId));
  if (!incident || incident.status !== "RECOVERED" || !incident.closureReceiptId)
    throw new Error("UNVERIFIED_RECOVERY_CANNOT_BECOME_TRUSTED_MEMORY");
  const [row] = await db
    .select()
    .from(t.recoveryReceipts)
    .where(eq(t.recoveryReceipts.id, incident.closureReceiptId));
  if (!row) throw new Error("VERIFIED_RECEIPT_MISSING");
  const receipt = recoveryReceiptSchema.parse(row.payload);
  if (
    receipt.verdict !== "RECOVERED" ||
    receipt.incidentId !== incidentId ||
    receipt.invariantResults.some((r) => r.status !== "PASS")
  )
    throw new Error("UNVERIFIED_RECOVERY_CANNOT_BECOME_TRUSTED_MEMORY");
  await validateReceiptEvidence(db, receipt);
  const recovery = (await readRecovery(db, incident.revisionId))!;
  const [revision] = await db
    .select()
    .from(t.truthRevisions)
    .where(eq(t.truthRevisions.id, receipt.revisionId));
  const facts = await db
    .select()
    .from(t.truthAssertions)
    .where(eq(t.truthAssertions.assertionId, revision!.replacementAssertionId));
  const fact = facts.find((f) => f.version === revision!.replacementVersion);
  if (!fact) throw new Error("VERIFIED_TRIGGER_EVIDENCE_MISSING");
  const failedCompensators = recovery.evidence
    .filter((e) => e.kind === "FAILURE")
    .map((e) => {
      const step = recovery.steps.find((s) => s.stepId === e.stepId);
      return {
        capabilityId: step?.capabilityId ?? "unknown",
        code: String((e.payload as { code?: string }).code ?? "UNKNOWN"),
        preconditionFingerprint: fingerprint(step?.parameters.expectedBefore ?? {}),
      };
    });
  return {
    incidentId,
    receiptId: receipt.receiptId,
    revisionId: receipt.revisionId,
    factKey: fact.factKey,
    correctedStatus: String((fact.value as { status?: string })?.status ?? "unknown"),
    targetTypes: [...new Set(recovery.effects.map((e) => e.target.entityType))].sort(),
    changedDecisions: receipt.decisions.changed,
    preservedDecisions: receipt.decisions.preserved,
    successfulCapabilities: [
      ...new Set(recovery.steps.filter((s) => s.status === "SUCCEEDED").map((s) => s.capabilityId)),
    ].sort(),
    failedCompensators,
    irreversiblePattern:
      "Historical notification retained; explicit COMPLIANCE corrective escalation",
    verification: receipt.invariantResults.map((r) => ({ id: r.resultId, status: "PASS" })),
    verdict: "RECOVERED",
    traceId: receipt.traceId,
  };
}
function queryText(query: MemoryQuery) {
  return `${query.correctedStatus} ${query.factKey} ${[...query.targetTypes].sort().join(" ")} verified recovery`;
}
function experienceContent(e: VerifiedExperience) {
  return `${queryText(e)}. Procurement finance receiving notification recovery verified. Incident ${e.incidentId}. Capabilities ${e.successfulCapabilities.join(" ")}. ${e.irreversiblePattern}. Prior failed compensators: ${e.failedCompensators.map((f) => `${f.capabilityId} ${f.code}`).join("; ") || "none"}. Proof ${e.receiptId}.`;
}

/** Documented local H-MEM engine plus a transactional PostgreSQL state/ledger adapter. No network API is guessed. */
export class HmemRecoveryMemory implements MeterlessRecoveryMemory {
  constructor(private readonly db: Db) {}
  private async engineTransaction<T>(
    work: (engine: HMEM, state: StatePayload, tx: Db) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction(async (tx) => {
      await tx
        .insert(t.hmemState)
        .values({
          id: STATE_ID,
          upstreamSha: HMEM_UPSTREAM_SHA,
          payload: { records: [], seq: 0, lastAdvisory: null },
          updatedAt: new Date(),
        })
        .onConflictDoNothing();
      const [row] = await tx
        .select()
        .from(t.hmemState)
        .where(eq(t.hmemState.id, STATE_ID))
        .for("update");
      if (row!.upstreamSha !== HMEM_UPSTREAM_SHA) throw new Error("H_MEM_ENGINE_VERSION_MISMATCH");
      const state = row!.payload as StatePayload;
      if (!Array.isArray(state.records) || !Number.isInteger(state.seq))
        throw new Error("H_MEM_STATE_INVALID");
      const engine = new HMEM({ actor: "brindle.verified-recovery-memory" });
      engine.store.restoreAll(state.records, state.seq);
      const ledger = await tx.select().from(t.hmemLedger).orderBy(t.hmemLedger.ordinal);
      engine.ledger.hydrate(ledger.map((r) => r.payload as LedgerEntry));
      const ledgerOffset = engine.ledger.all().length;
      const result = await work(engine, state, tx);
      const snapshot = engine.store.snapshotAll();
      await tx
        .update(t.hmemState)
        .set({
          payload: { ...snapshot, lastAdvisory: state.lastAdvisory ?? null },
          updatedAt: new Date(),
        })
        .where(eq(t.hmemState.id, STATE_ID));
      for (const [index, event] of engine.ledger.all().slice(ledgerOffset).entries())
        await tx.insert(t.hmemLedger).values({
          id: randomUUID(),
          ordinal: ledgerOffset + index + 1,
          memoryId: event.memoryId,
          action: event.action,
          payload: event,
          recordedAt: new Date(event.timestamp),
        });
      return result;
    });
  }
  async remember(entry: RecoveryMemoryEntry): Promise<MemoryRef> {
    if (entry.kind !== "RECOVERY_PATTERN")
      throw new Error("ONLY_VERIFIED_RECOVERY_PATTERNS_ARE_SUPPORTED");
    return this.engineTransaction(async (engine, _state, tx) => {
      const experience = await verifiedExperience(tx, entry.key);
      if (canonical(entry.payload) !== canonical(experience))
        throw new Error("RECOVERY_MEMORY_EVIDENCE_CONFLICT");
      const source = `brindle:verified:${experience.receiptId}`;
      const existing = engine.store.all().find((m) => m.source === source);
      const memory =
        existing ??
        engine.add({
          content: experienceContent(experience),
          type: "factual",
          layer: "long_term",
          tags: [
            "project:brindle-recovery",
            experience.factKey,
            experience.correctedStatus,
            ...experience.targetTypes,
          ],
          confidence: 1,
          source,
          provenance: {
            origin: "plan_completion",
            learnedAt: Date.now(),
            label: "Invariant-verified Brindle recovery",
            refs: [experience.receiptId, ...experience.verification.map((v) => v.id)],
          },
        });
      return { memoryId: memory.id, kind: "RECOVERY_PATTERN", version: 1 };
    });
  }
  async lookup(query: MemoryQuery): Promise<MemoryAdvisory> {
    return this.engineTransaction(async (engine, state, tx) => {
      const result = engine.query(queryText(query));
      const matches: MemoryAdvisory["matches"] = [];
      for (const found of result.memories) {
        if (!found.memory.source.startsWith("brindle:verified:")) continue;
        const receiptId = found.memory.source.slice("brindle:verified:".length);
        const [row] = await tx
          .select()
          .from(t.recoveryReceipts)
          .where(eq(t.recoveryReceipts.id, receiptId));
        if (!row) continue;
        let experience: VerifiedExperience;
        try {
          experience = await verifiedExperience(tx, row.incidentId);
        } catch {
          continue;
        }
        if (
          experience.incidentId === query.excludeIncidentId ||
          experience.factKey !== query.factKey ||
          experience.correctedStatus !== query.correctedStatus ||
          !query.targetTypes.some((type) => experience.targetTypes.includes(type))
        )
          continue;
        const warnings = experience.failedCompensators.map(
          (f) =>
            `Prior ${f.capabilityId} failed (${f.code}); inspect precondition ${f.preconditionFingerprint}. Prior success is not permission to repeat it.`,
        );
        matches.push({
          memoryId: found.memory.id,
          relevance: found.relevance,
          experience,
          warnings,
        });
      }
      const advisory: MemoryAdvisory = {
        engine: HMEM_ENGINE_STATUS,
        upstreamSha: HMEM_UPSTREAM_SHA,
        query: { ...query, targetTypes: [...query.targetTypes] },
        matches,
        trace: result.trace,
        authority: "ADVISORY_ONLY",
        context: engine.retrieval.formatReinjection(
          result.memories.filter((item) => matches.some((m) => m.memoryId === item.memory.id)),
        ),
      };
      state.lastAdvisory = advisory;
      return advisory;
    });
  }
  async recall(query: { kind: MemoryRef["kind"]; key: string }): Promise<RecoveryMemoryEntry[]> {
    if (query.kind !== "RECOVERY_PATTERN" || query.key !== "certification.ISO-9001:REVOKED")
      return [];
    const result = await this.lookup({
      factKey: "certification.ISO-9001",
      correctedStatus: "REVOKED",
      targetTypes: [
        "purchase_order",
        "finance_approval",
        "receiving_allocation",
        "supplier_notification",
      ],
    });
    return result.matches.map((m) => ({
      kind: "RECOVERY_PATTERN",
      key: m.experience.incidentId,
      payload: {
        ...m.experience,
        engineTrace: result.trace,
        relevance: m.relevance,
        warnings: m.warnings,
      },
    }));
  }
}
export async function promoteVerifiedRecovery(db: Db, incidentId: string) {
  const experience = await verifiedExperience(db, incidentId);
  return new HmemRecoveryMemory(db).remember({
    kind: "RECOVERY_PATTERN",
    key: incidentId,
    payload: { ...experience },
  });
}
export async function readRecoveryMemory(db: Db) {
  const [row] = await db.select().from(t.hmemState).where(eq(t.hmemState.id, STATE_ID));
  const ledger = await db.select().from(t.hmemLedger);
  const payload = row?.payload as StatePayload | undefined;
  return {
    engine: HMEM_ENGINE_STATUS,
    upstreamSha: HMEM_UPSTREAM_SHA,
    recordCount: payload?.records.length ?? 0,
    ledgerCount: ledger.length,
    lastAdvisory: payload?.lastAdvisory ?? null,
  };
}
