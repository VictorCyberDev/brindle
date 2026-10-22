import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import postgres from "postgres";
import type { AppConfig } from "../config/env";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface DbHandle {
  db: Db;
  /** "postgres": DATABASE_URL. "pglite": in-process PostgreSQL, MOCK/local mode only. */
  kind: "postgres" | "pglite";
  close: () => Promise<void>;
}

export class DatabaseNotConfiguredError extends Error {
  override name = "DatabaseNotConfiguredError";
  constructor() {
    super(
      "DATABASE_URL is not set. Configure it in .env.local (see .env.example) to use the database.",
    );
  }
}

/** Creates a PostgreSQL-backed client lazily; importing this module never opens a connection. */
export function createDb(config: Pick<AppConfig, "databaseUrl">): DbHandle {
  if (!config.databaseUrl) throw new DatabaseNotConfiguredError();
  const client = postgres(config.databaseUrl, { max: 5 });
  return { db: drizzlePostgres(client, { schema }), kind: "postgres", close: () => client.end() };
}

/**
 * In-process PostgreSQL (PGlite) with every committed migration applied. Used
 * for tests and for local MOCK mode without a database; never in LIVE mode.
 */
export async function createEphemeralDb(migrationsFolder = "./drizzle"): Promise<DbHandle> {
  const [{ PGlite }, { drizzle }, { migrate }] = await Promise.all([
    import("@electric-sql/pglite"),
    import("drizzle-orm/pglite"),
    import("drizzle-orm/pglite/migrator"),
  ]);
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  return { db, kind: "pglite", close: () => client.close() };
}

/** App-level handle: real PostgreSQL when configured, otherwise (MOCK only) an ephemeral one. */
export async function openDb(
  config: Pick<AppConfig, "databaseUrl" | "runtimeMode">,
): Promise<DbHandle> {
  if (config.databaseUrl) return createDb(config);
  if (config.runtimeMode === "live") throw new DatabaseNotConfiguredError();
  return createEphemeralDb();
}

export { schema };
