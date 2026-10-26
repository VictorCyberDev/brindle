import { getConfig } from "../config/env";
import { createDb, createEphemeralDb, type DbHandle } from "../db/client";

const KEY = Symbol.for("brindle.productDb");
type Holder = { [KEY]?: Promise<DbHandle> };

export class ProductDatabaseUnavailable extends Error {
  override name = "ProductDatabaseUnavailable";
}

/**
 * The product database: PostgreSQL via DATABASE_URL (Neon in production). Without DATABASE_URL, an
 * in-process PostgreSQL is used for local development and tests only; production refuses to start
 * the authenticated app without a durable database.
 */
export function getProductDb(): Promise<DbHandle> {
  const holder = globalThis as Holder;
  holder[KEY] ??= (async () => {
    const config = getConfig();
    if (config.databaseUrl) return createDb(config);
    if (config.nodeEnv === "production") {
      throw new ProductDatabaseUnavailable(
        "DATABASE_URL is required to run the authenticated app in production.",
      );
    }
    return createEphemeralDb();
  })().catch((error) => {
    holder[KEY] = undefined;
    throw error;
  });
  return holder[KEY];
}
