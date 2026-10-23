ALTER TYPE "public"."po_status" ADD VALUE 'CANCELLED';--> statement-breakpoint
CREATE TABLE "recovery_evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"incident_id" text NOT NULL,
	"step_id" text,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "recovery_evidence_kind_chk" CHECK ("recovery_evidence"."kind" IN ('PLAN', 'EXECUTION', 'FAILURE', 'REMEDIATION')),
	CONSTRAINT "recovery_evidence_step_chk" CHECK (("recovery_evidence"."kind" = 'PLAN') = ("recovery_evidence"."step_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "recovery_evidence" ADD CONSTRAINT "recovery_evidence_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_evidence" ADD CONSTRAINT "recovery_evidence_step_id_recovery_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."recovery_steps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recovery_evidence_incident_idx" ON "recovery_evidence" USING btree ("incident_id");--> statement-breakpoint
CREATE INDEX "recovery_evidence_step_idx" ON "recovery_evidence" USING btree ("step_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recovery_evidence_one_execution_uq" ON "recovery_evidence" USING btree ("step_id") WHERE "recovery_evidence"."kind" IN ('EXECUTION', 'REMEDIATION');--> statement-breakpoint
CREATE UNIQUE INDEX "recovery_evidence_one_plan_uq" ON "recovery_evidence" USING btree ("incident_id") WHERE "recovery_evidence"."kind" = 'PLAN';