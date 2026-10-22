import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { AppConfig } from "../config/env";
import * as schema from "./schema";

export class DatabaseNotConfiguredError extends Error {
  override name = "DatabaseNotConfiguredError";
  constructor() {
    super(
      "DATABASE_URL is not set. Configure it in .env.local (see .env.example) to use the database.",
    );
  }
}

/** Creates a Drizzle client lazily; importing this module never opens a connection. */
export function createDb(config: Pick<AppConfig, "databaseUrl">) {
  if (!config.databaseUrl) throw new DatabaseNotConfiguredError();
  const client = postgres(config.databaseUrl, { max: 5 });
  return { db: drizzle(client, { schema }), close: () => client.end() };
}

export { schema };
