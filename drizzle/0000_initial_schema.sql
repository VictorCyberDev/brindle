CREATE TYPE "public"."consequence_edge_type" AS ENUM('INFORMED', 'DERIVED_FROM', 'CAUSED', 'MUTATED', 'DEPENDS_ON', 'SUPERSEDES');--> statement-breakpoint
CREATE TYPE "public"."consequence_node_kind" AS ENUM('TRUTH_VERSION', 'MEMORY', 'DECISION', 'ACTION', 'BUSINESS_OBJECT');--> statement-breakpoint
CREATE TYPE "public"."counterfactual_result" AS ENUM('SAME', 'CHANGED', 'UNCERTAIN');--> statement-breakpoint
CREATE TYPE "public"."effect_classification" AS ENUM('REVERSIBLE', 'COMPENSABLE', 'IRREVERSIBLE');--> statement-breakpoint
CREATE TYPE "public"."incident_status" AS ENUM('OPEN', 'ANALYZING', 'RECOVERY_PLANNED', 'RECOVERING', 'VERIFYING', 'RECOVERY_INCOMPLETE', 'ESCALATED', 'RECOVERED');--> statement-breakpoint
CREATE TYPE "public"."invariant_status" AS ENUM('PASS', 'FAIL', 'ERROR');--> statement-breakpoint
CREATE TYPE "public"."recovery_mode" AS ENUM('REVERSE', 'COMPENSATE', 'REMEDIATE');--> statement-breakpoint
CREATE TYPE "public"."recovery_step_status" AS ENUM('PLANNED', 'EXECUTING', 'SUCCEEDED', 'FAILED', 'SKIPPED');--> statement-breakpoint
CREATE TYPE "public"."recovery_verdict" AS ENUM('RECOVERED', 'RECOVERY_INCOMPLETE', 'ESCALATED');--> statement-breakpoint
CREATE TABLE "consequence_edges" (
	"id" text PRIMARY KEY NOT NULL,
	"from_node_id" text NOT NULL,
	"to_node_id" text NOT NULL,
	"type" "consequence_edge_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consequence_edges_from_to_type_uq" UNIQUE("from_node_id","to_node_id","type"),
	CONSTRAINT "consequence_edges_no_self_loop_chk" CHECK ("consequence_edges"."from_node_id" <> "consequence_edges"."to_node_id")
);
--> statement-breakpoint
CREATE TABLE "consequence_nodes" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "consequence_node_kind" NOT NULL,
	"ref_id" text NOT NULL,
	"label" text,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consequence_nodes_kind_ref_uq" UNIQUE("kind","ref_id")
);
--> statement-breakpoint
CREATE TABLE "counterfactual_assessments" (
	"id" text PRIMARY KEY NOT NULL,
	"decision_id" text NOT NULL,
	"revision_id" text NOT NULL,
	"result" "counterfactual_result" NOT NULL,
	"reconstruction" jsonb NOT NULL,
	"counterfactual_action" jsonb,
	"uncertainty_reason" text,
	"model_id" text,
	"trace_id" text NOT NULL,
	"assessed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "counterfactual_changed_has_action_chk" CHECK ("counterfactual_assessments"."result" <> 'CHANGED' OR "counterfactual_assessments"."counterfactual_action" IS NOT NULL),
	CONSTRAINT "counterfactual_uncertain_has_reason_chk" CHECK ("counterfactual_assessments"."result" <> 'UNCERTAIN' OR "counterfactual_assessments"."uncertainty_reason" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "decision_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"objective" text NOT NULL,
	"decided_at" timestamp with time zone NOT NULL,
	"policy_version" text NOT NULL,
	"model_id" text NOT NULL,
	"prompt_version" text NOT NULL,
	"schema_version" text NOT NULL,
	"action_type" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"trace_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "effects" (
	"id" text PRIMARY KEY NOT NULL,
	"action_node_id" text NOT NULL,
	"classification" "effect_classification" NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"description" text NOT NULL,
	"rule_id" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" text PRIMARY KEY NOT NULL,
	"revision_id" text NOT NULL,
	"status" "incident_status" DEFAULT 'OPEN' NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"closure" jsonb,
	"closure_receipt_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "incidents_closure_iff_recovered_chk" CHECK (("incidents"."status" = 'RECOVERED') = ("incidents"."closure" IS NOT NULL AND "incidents"."closure_receipt_id" IS NOT NULL)),
	CONSTRAINT "incidents_time_order_chk" CHECK ("incidents"."updated_at" >= "incidents"."opened_at")
);
--> statement-breakpoint
CREATE TABLE "invariant_results" (
	"id" text PRIMARY KEY NOT NULL,
	"incident_id" text NOT NULL,
	"invariant_id" text NOT NULL,
	"status" "invariant_status" NOT NULL,
	"verifier_id" text NOT NULL,
	"observation" jsonb NOT NULL,
	"detail" jsonb,
	"verified_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invariant_results_fresh_read_chk" CHECK ("invariant_results"."observation" ->> 'kind' = 'FRESH_INDEPENDENT_READ')
);
--> statement-breakpoint
CREATE TABLE "recovery_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"incident_id" text NOT NULL,
	"revision_id" text NOT NULL,
	"verdict" "recovery_verdict" NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recovery_steps" (
	"id" text PRIMARY KEY NOT NULL,
	"incident_id" text NOT NULL,
	"effect_id" text NOT NULL,
	"capability_id" text NOT NULL,
	"mode" "recovery_mode" NOT NULL,
	"effect_classification" "effect_classification" NOT NULL,
	"idempotency_key" text NOT NULL,
	"parameters" jsonb NOT NULL,
	"status" "recovery_step_status" DEFAULT 'PLANNED' NOT NULL,
	"planned_at" timestamp with time zone NOT NULL,
	"executed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recovery_steps_mode_matches_classification_chk" CHECK (("recovery_steps"."effect_classification" = 'REVERSIBLE' AND "recovery_steps"."mode" = 'REVERSE')
        OR ("recovery_steps"."effect_classification" = 'COMPENSABLE' AND "recovery_steps"."mode" = 'COMPENSATE')
        OR ("recovery_steps"."effect_classification" = 'IRREVERSIBLE' AND "recovery_steps"."mode" = 'REMEDIATE'))
);
--> statement-breakpoint
CREATE TABLE "truth_assertions" (
	"id" text PRIMARY KEY NOT NULL,
	"assertion_id" text NOT NULL,
	"version" integer NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"source_id" text NOT NULL,
	"fact_key" text NOT NULL,
	"value" jsonb NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_to" timestamp with time zone,
	"observed_at" timestamp with time zone NOT NULL,
	"provenance" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "truth_assertions_assertion_version_uq" UNIQUE("assertion_id","version"),
	CONSTRAINT "truth_assertions_identity_version_uq" UNIQUE("subject_type","subject_id","source_id","fact_key","version"),
	CONSTRAINT "truth_assertions_version_chk" CHECK ("truth_assertions"."version" >= 1),
	CONSTRAINT "truth_assertions_valid_range_chk" CHECK ("truth_assertions"."valid_to" IS NULL OR "truth_assertions"."valid_to" > "truth_assertions"."valid_from")
);
--> statement-breakpoint
CREATE TABLE "truth_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"previous_assertion_id" text NOT NULL,
	"previous_version" integer NOT NULL,
	"replacement_assertion_id" text NOT NULL,
	"replacement_version" integer NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_to" timestamp with time zone,
	"observed_at" timestamp with time zone NOT NULL,
	"retroactive" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "truth_revisions_pair_uq" UNIQUE("previous_assertion_id","previous_version","replacement_version"),
	CONSTRAINT "truth_revisions_same_fact_chk" CHECK ("truth_revisions"."previous_assertion_id" = "truth_revisions"."replacement_assertion_id"),
	CONSTRAINT "truth_revisions_version_order_chk" CHECK ("truth_revisions"."replacement_version" > "truth_revisions"."previous_version"),
	CONSTRAINT "truth_revisions_range_chk" CHECK ("truth_revisions"."effective_to" IS NULL OR "truth_revisions"."effective_to" > "truth_revisions"."effective_from"),
	CONSTRAINT "truth_revisions_retroactive_chk" CHECK ("truth_revisions"."retroactive" = ("truth_revisions"."effective_from" < "truth_revisions"."observed_at"))
);
--> statement-breakpoint
ALTER TABLE "consequence_edges" ADD CONSTRAINT "consequence_edges_from_node_id_consequence_nodes_id_fk" FOREIGN KEY ("from_node_id") REFERENCES "public"."consequence_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consequence_edges" ADD CONSTRAINT "consequence_edges_to_node_id_consequence_nodes_id_fk" FOREIGN KEY ("to_node_id") REFERENCES "public"."consequence_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "counterfactual_assessments" ADD CONSTRAINT "counterfactual_assessments_decision_id_decision_receipts_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."decision_receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "counterfactual_assessments" ADD CONSTRAINT "counterfactual_assessments_revision_id_truth_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."truth_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "effects" ADD CONSTRAINT "effects_action_node_id_consequence_nodes_id_fk" FOREIGN KEY ("action_node_id") REFERENCES "public"."consequence_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_revision_id_truth_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."truth_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_closure_receipt_id_recovery_receipts_id_fk" FOREIGN KEY ("closure_receipt_id") REFERENCES "public"."recovery_receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invariant_results" ADD CONSTRAINT "invariant_results_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_receipts" ADD CONSTRAINT "recovery_receipts_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_receipts" ADD CONSTRAINT "recovery_receipts_revision_id_truth_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."truth_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_steps" ADD CONSTRAINT "recovery_steps_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_steps" ADD CONSTRAINT "recovery_steps_effect_id_effects_id_fk" FOREIGN KEY ("effect_id") REFERENCES "public"."effects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "truth_revisions" ADD CONSTRAINT "truth_revisions_previous_fk" FOREIGN KEY ("previous_assertion_id","previous_version") REFERENCES "public"."truth_assertions"("assertion_id","version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "truth_revisions" ADD CONSTRAINT "truth_revisions_replacement_fk" FOREIGN KEY ("replacement_assertion_id","replacement_version") REFERENCES "public"."truth_assertions"("assertion_id","version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consequence_edges_from_idx" ON "consequence_edges" USING btree ("from_node_id","type");--> statement-breakpoint
CREATE INDEX "consequence_edges_to_idx" ON "consequence_edges" USING btree ("to_node_id","type");--> statement-breakpoint
CREATE INDEX "counterfactual_decision_revision_idx" ON "counterfactual_assessments" USING btree ("decision_id","revision_id");--> statement-breakpoint
CREATE INDEX "counterfactual_result_idx" ON "counterfactual_assessments" USING btree ("revision_id","result");--> statement-breakpoint
CREATE INDEX "decision_receipts_agent_idx" ON "decision_receipts" USING btree ("agent_id","decided_at");--> statement-breakpoint
CREATE INDEX "decision_receipts_target_idx" ON "decision_receipts" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "decision_receipts_trace_idx" ON "decision_receipts" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "effects_action_node_idx" ON "effects" USING btree ("action_node_id");--> statement-breakpoint
CREATE INDEX "effects_target_idx" ON "effects" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "incidents_revision_idx" ON "incidents" USING btree ("revision_id");--> statement-breakpoint
CREATE INDEX "incidents_status_idx" ON "incidents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "invariant_results_incident_invariant_idx" ON "invariant_results" USING btree ("incident_id","invariant_id","verified_at");--> statement-breakpoint
CREATE INDEX "recovery_receipts_incident_idx" ON "recovery_receipts" USING btree ("incident_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recovery_receipts_one_recovered_uq" ON "recovery_receipts" USING btree ("incident_id") WHERE "recovery_receipts"."verdict" = 'RECOVERED';--> statement-breakpoint
CREATE UNIQUE INDEX "recovery_steps_idempotency_uq" ON "recovery_steps" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "recovery_steps_incident_idx" ON "recovery_steps" USING btree ("incident_id","status");--> statement-breakpoint
CREATE INDEX "recovery_steps_effect_idx" ON "recovery_steps" USING btree ("effect_id");--> statement-breakpoint
CREATE INDEX "truth_assertions_subject_fact_idx" ON "truth_assertions" USING btree ("subject_type","subject_id","fact_key");--> statement-breakpoint
CREATE INDEX "truth_assertions_observed_at_idx" ON "truth_assertions" USING btree ("observed_at");--> statement-breakpoint
CREATE INDEX "truth_revisions_observed_at_idx" ON "truth_revisions" USING btree ("observed_at");