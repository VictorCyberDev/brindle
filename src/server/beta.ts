import { and, eq, gt } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Db } from "../db/client";
import * as t from "../db/schema";

export const betaRequestSchema = z.strictObject({
  email: z.email().max(200),
  company: z.string().trim().min(2).max(120),
  role: z.string().trim().min(2).max(120),
  useCase: z.string().trim().min(10).max(1000),
  /** Honeypot: real people never see or fill this field. */
  website: z.string().max(0).optional(),
});

export class BetaRequestRejected extends Error {
  override name = "BetaRequestRejected";
  constructor(
    message: string,
    public readonly kind: "invalid" | "rate_limited" | "duplicate",
  ) {
    super(message);
  }
}

export const hashIp = (ip: string, salt: string) =>
  createHash("sha256").update(`${salt}|${ip}`).digest("hex").slice(0, 32);

const HOUR = 3_600_000;
const MAX_PER_IP_PER_HOUR = 3;

/** Stores a private-beta access request. Raw IPs are never stored; only a salted hash for abuse limits. */
export async function submitBetaRequest(
  db: Db,
  raw: unknown,
  ip: string,
  salt: string,
  now = new Date(),
) {
  const parsed = betaRequestSchema.safeParse(raw);
  if (!parsed.success) {
    throw new BetaRequestRejected(
      "Please check the form: a valid email, company, role and a sentence about your agent use case are needed.",
      "invalid",
    );
  }
  const input = parsed.data;
  if (input.website) throw new BetaRequestRejected("Thanks.", "invalid"); // honeypot: pretend success upstream
  const ipHash = hashIp(ip, salt);
  const recent = await db
    .select()
    .from(t.betaRequests)
    .where(
      and(
        eq(t.betaRequests.ipHash, ipHash),
        gt(t.betaRequests.createdAt, new Date(now.getTime() - HOUR)),
      ),
    );
  if (recent.length >= MAX_PER_IP_PER_HOUR) {
    throw new BetaRequestRejected(
      "Too many requests from this network. Please try again later.",
      "rate_limited",
    );
  }
  const email = input.email.toLowerCase();
  const sameEmail = await db
    .select()
    .from(t.betaRequests)
    .where(
      and(
        eq(t.betaRequests.email, email),
        gt(t.betaRequests.createdAt, new Date(now.getTime() - 24 * HOUR)),
      ),
    );
  if (sameEmail.length)
    throw new BetaRequestRejected(
      "We already have your request. We will be in touch.",
      "duplicate",
    );
  await db.insert(t.betaRequests).values({
    id: `beta_${randomUUID()}`,
    email,
    company: input.company,
    role: input.role,
    useCase: input.useCase,
    ipHash,
  });
}
