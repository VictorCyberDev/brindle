import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { getConfig } from "../config/env";
import type { Db } from "../db/client";
import * as schema from "../db/schema";
import { getProductDb } from "./db";

/**
 * Authentication is Better Auth (open source, MIT): email + password, database sessions, and
 * built-in password hashing and rate limiting. Nothing cryptographic is hand-rolled here.
 */
export function buildAuth(db: Db, options: { secret: string; baseUrl?: string }) {
  return betterAuth({
    secret: options.secret,
    baseURL: options.baseUrl,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        rateLimit: schema.rateLimit,
      },
    }),
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      requireEmailVerification: false, // private beta: no mail provider yet (documented limitation)
    },
    session: { expiresIn: 60 * 60 * 24 * 14, updateAge: 60 * 60 * 24 },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 30 },
    trustedOrigins: [
      ...(options.baseUrl ? [options.baseUrl] : []),
      ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
      ...(process.env.VERCEL_BRANCH_URL ? [`https://${process.env.VERCEL_BRANCH_URL}`] : []),
      ...(process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`]
        : []),
    ],
    plugins: [nextCookies()], // must stay last
  });
}

export type Auth = ReturnType<typeof buildAuth>;

const KEY = Symbol.for("brindle.auth");
type Holder = { [KEY]?: Promise<Auth> };

export function getAuth(): Promise<Auth> {
  const holder = globalThis as Holder;
  holder[KEY] ??= (async () => {
    const config = getConfig();
    if (config.auth.status !== "configured") {
      throw new Error("BETTER_AUTH_SECRET is required to run the authenticated app in production.");
    }
    const { db } = await getProductDb();
    return buildAuth(db, { secret: config.auth.secret, baseUrl: config.auth.baseUrl });
  })().catch((error) => {
    holder[KEY] = undefined;
    throw error;
  });
  return holder[KEY];
}
