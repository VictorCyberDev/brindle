import { and, desc, eq, isNull } from "drizzle-orm";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { Db } from "../db/client";
import * as t from "../db/schema";

/**
 * Workspace API keys. A key is 32 random bytes (256 bits), so a fast SHA-256 is the right storage
 * hash: there is nothing to brute-force. The plaintext is returned exactly once at creation; only
 * the hash and a short non-secret prefix are stored. Keys are never logged and never returned again.
 */
export const KEY_PREFIX = "brk_";
export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

export interface IssuedKey {
  id: string;
  /** Shown once. */
  plaintext: string;
  prefix: string;
}

export async function issueApiKey(
  db: Db,
  input: { workspaceId: string; label: string; createdBy: string },
): Promise<IssuedKey> {
  const label = input.label.trim();
  if (label.length < 2 || label.length > 60)
    throw new Error("Give the key a label of 2-60 characters.");
  const plaintext = `${KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
  const id = `key_${randomUUID()}`;
  const prefix = plaintext.slice(0, KEY_PREFIX.length + 6);
  await db.insert(t.apiKeys).values({
    id,
    workspaceId: input.workspaceId,
    label,
    prefix,
    keyHash: hashKey(plaintext),
    createdBy: input.createdBy,
  });
  return { id, plaintext, prefix };
}

export async function listApiKeys(db: Db, workspaceId: string) {
  return db
    .select({
      id: t.apiKeys.id,
      label: t.apiKeys.label,
      prefix: t.apiKeys.prefix,
      createdAt: t.apiKeys.createdAt,
      lastUsedAt: t.apiKeys.lastUsedAt,
      revokedAt: t.apiKeys.revokedAt,
    })
    .from(t.apiKeys)
    .where(eq(t.apiKeys.workspaceId, workspaceId))
    .orderBy(desc(t.apiKeys.createdAt));
}

export async function revokeApiKey(db: Db, workspaceId: string, keyId: string) {
  await db
    .update(t.apiKeys)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(t.apiKeys.id, keyId),
        eq(t.apiKeys.workspaceId, workspaceId),
        isNull(t.apiKeys.revokedAt),
      ),
    );
}

/** Resolves a presented key to its workspace, or null. Revoked keys never authenticate. */
export async function authenticateApiKey(db: Db, presented: string | null) {
  if (!presented || !presented.startsWith(KEY_PREFIX) || presented.length > 200) return null;
  const hash = hashKey(presented);
  const [row] = await db.select().from(t.apiKeys).where(eq(t.apiKeys.keyHash, hash));
  if (!row || row.revokedAt) return null;
  const a = Buffer.from(row.keyHash),
    b = Buffer.from(hash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  await db.update(t.apiKeys).set({ lastUsedAt: new Date() }).where(eq(t.apiKeys.id, row.id));
  return { workspaceId: row.workspaceId, keyId: row.id };
}
