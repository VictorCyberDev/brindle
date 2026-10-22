CREATE TYPE "public"."demo_run_mode" AS ENUM('LIVE', 'MOCK');--> statement-breakpoint
CREATE TYPE "public"."demo_run_status" AS ENUM('COMPLETED', 'BLOCKED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."po_status" AS ENUM('CREATED', 'APPROVED', 'RECEIVING_SCHEDULED');--> statement-breakpoint
CREATE TABLE "demo_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"mode" "demo_run_mode" NOT NULL,
	"status" "demo_run_status" NOT NULL,
	"truth_source_id" text NOT NULL,
	"reasoning_provider" text NOT NULL,
	"model_id" text NOT NULL,
	"trace_id" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	"detail" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_approvals" (
	"id" text PRIMARY KEY NOT NULL,
	"po_id" text NOT NULL,
	"approved_amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"decision_id" text NOT NULL,
	"approved_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_approvals_po_id_unique" UNIQUE("po_id")
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_id" text NOT NULL,
	"supplier_name" text NOT NULL,
	"description" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"status" "po_status" DEFAULT 'CREATED' NOT NULL,
	"created_by_decision_id" text NOT NULL,
	"placed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_orders_amount_chk" CHECK ("purchase_orders"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "receiving_allocations" (
	"id" text PRIMARY KEY NOT NULL,
	"po_id" text NOT NULL,
	"dock_id" text NOT NULL,
	"expected_arrival" timestamp with time zone NOT NULL,
	"decision_id" text NOT NULL,
	"allocated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receiving_allocations_po_id_unique" UNIQUE("po_id")
);
--> statement-breakpoint
CREATE TABLE "supplier_notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"po_id" text NOT NULL,
	"supplier_id" text NOT NULL,
	"channel" text NOT NULL,
	"subject" text NOT NULL,
	"decision_id" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_notifications_po_id_unique" UNIQUE("po_id"),
	CONSTRAINT "supplier_notifications_sandbox_chk" CHECK ("supplier_notifications"."channel" = 'SANDBOX_RECORD')
);
--> statement-breakpoint
ALTER TABLE "finance_approvals" ADD CONSTRAINT "finance_approvals_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_approvals" ADD CONSTRAINT "finance_approvals_decision_id_decision_receipts_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."decision_receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_decision_id_decision_receipts_id_fk" FOREIGN KEY ("created_by_decision_id") REFERENCES "public"."decision_receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receiving_allocations" ADD CONSTRAINT "receiving_allocations_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receiving_allocations" ADD CONSTRAINT "receiving_allocations_decision_id_decision_receipts_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."decision_receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_notifications" ADD CONSTRAINT "supplier_notifications_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_notifications" ADD CONSTRAINT "supplier_notifications_decision_id_decision_receipts_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."decision_receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "demo_runs_started_idx" ON "demo_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "purchase_orders_supplier_idx" ON "purchase_orders" USING btree ("supplier_id");