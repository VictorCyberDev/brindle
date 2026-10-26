import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

/** Applies committed migrations to DATABASE_URL (used for the hosted beta). Prints no connection details. */
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const client = postgres(url, { max: 1, prepare: false, connect_timeout: 30 });
try {
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  console.log("migrations applied");
} catch (e) {
  console.error(
    "migration failed:",
    e instanceof Error ? (e.cause instanceof Error ? e.cause.message : e.message) : "unknown",
  );
  process.exitCode = 1;
} finally {
  await client.end();
}
