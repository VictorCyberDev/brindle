CREATE TABLE "hmem_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"ordinal" integer NOT NULL,
	"memory_id" text NOT NULL,
	"action" text NOT NULL,
	"payload" jsonb NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "hmem_ledger_ordinal_unique" UNIQUE("ordinal")
);
--> statement-breakpoint
CREATE TABLE "hmem_state" (
	"id" text PRIMARY KEY NOT NULL,
	"upstream_sha" text NOT NULL,
	"payload" jsonb NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "hmem_ledger_memory_idx" ON "hmem_ledger" USING btree ("memory_id");--> statement-breakpoint
CREATE INDEX "hmem_ledger_time_idx" ON "hmem_ledger" USING btree ("recorded_at");