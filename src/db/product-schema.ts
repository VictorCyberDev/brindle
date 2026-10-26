import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/*
 * M6 product layer: authentication, workspaces, roles, API keys, beta requests, first-party events
 * and workspace-scoped customer evidence. The recovery ENGINE tables (schema.ts) are unchanged.
 * Every customer-owned row carries workspace_id; queries are always filtered by it.
 */
const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => tstz("created_at").notNull().defaultNow();

/* ------------------- Better Auth core tables (v1.7) ------------------- */
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: tstz("updated_at").notNull().defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: tstz("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: createdAt(),
    updatedAt: tstz("updated_at").notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: tstz("access_token_expires_at"),
    refreshTokenExpiresAt: tstz("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: tstz("updated_at").notNull().defaultNow(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: tstz("expires_at").notNull(),
    createdAt: createdAt(),
    updatedAt: tstz("updated_at").notNull().defaultNow(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

/* ------------------------- workspaces & roles ------------------------- */
export const WORKSPACE_ROLES = ["OWNER", "ADMIN", "OPERATOR", "AUDITOR"] as const;
export const RECOVERY_MODES_PRODUCT = ["SHADOW", "APPROVAL", "BOUNDED_AUTONOMOUS"] as const;
export const workspaceRoleEnum = pgEnum("workspace_role", WORKSPACE_ROLES);
export const workspaceKindEnum = pgEnum("workspace_kind", ["STANDARD", "DEMO"]);
export const recoveryModeProductEnum = pgEnum("workspace_recovery_mode", RECOVERY_MODES_PRODUCT);

export const workspaces = pgTable(
  "workspaces",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    kind: workspaceKindEnum("kind").notNull().default("STANDARD"),
    recoveryMode: recoveryModeProductEnum("recovery_mode").notNull().default("SHADOW"),
    /** Non-sensitive per-workspace state, e.g. demo replay progress. */
    settings: jsonb("settings")
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      "workspaces_demo_shadow_chk",
      sql`${t.kind} <> 'DEMO' OR ${t.recoveryMode} IN ('SHADOW','APPROVAL')`,
    ),
  ],
);

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: workspaceRoleEnum("role").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    index("workspace_members_user_idx").on(t.userId),
  ],
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    /** First characters of the key, shown in the UI to tell keys apart. Not secret. */
    prefix: text("prefix").notNull(),
    /** SHA-256 of the full key. The plaintext is shown once and never stored. */
    keyHash: text("key_hash").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
    lastUsedAt: tstz("last_used_at"),
    revokedAt: tstz("revoked_at"),
  },
  (t) => [
    uniqueIndex("api_keys_hash_uq").on(t.keyHash),
    index("api_keys_workspace_idx").on(t.workspaceId),
  ],
);

/* ------------------------ launch plumbing ------------------------ */
export const betaRequests = pgTable(
  "beta_requests",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    company: text("company").notNull(),
    role: text("role").notNull(),
    useCase: text("use_case").notNull(),
    /** Salted hash of the requester's IP, used only for abuse limiting. */
    ipHash: text("ip_hash").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("beta_requests_ip_idx").on(t.ipHash, t.createdAt),
    index("beta_requests_email_idx").on(t.email),
  ],
);

export const productEvents = pgTable(
  "product_events",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("product_events_name_idx").on(t.name, t.createdAt)],
);

/* ------------------- workspace-scoped customer evidence ------------------- */
export const INCIDENT_STATES = [
  "NEEDS_REVIEW",
  "IN_REVIEW",
  "RESOLVED_BY_HUMAN",
  "NO_ACTION_NEEDED",
] as const;
export const wsIncidentStateEnum = pgEnum("ws_incident_state", INCIDENT_STATES);

export const wsAgents = pgTable(
  "ws_agents",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    owner: text("owner").notNull().default(""),
    connectedSystems: jsonb("connected_systems")
      .notNull()
      .default(sql`'[]'::jsonb`),
    lastSeenAt: tstz("last_seen_at"),
    createdAt: createdAt(),
  },
  (t) => [unique("ws_agents_name_uq").on(t.workspaceId, t.name)],
);

/** A decision an agent made, as reported by the customer. Brindle stores what it was given. */
export const wsDecisions = pgTable(
  "ws_decisions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    agentId: text("agent_id")
      .notNull()
      .references(() => wsAgents.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    decidedAt: tstz("decided_at").notNull(),
    summary: text("summary").notNull(),
    action: jsonb("action").notNull(),
    truthInputs: jsonb("truth_inputs").notNull(),
    consequences: jsonb("consequences").notNull(),
    receivedAt: createdAt(),
  },
  (t) => [
    unique("ws_decisions_external_uq").on(t.workspaceId, t.externalId),
    index("ws_decisions_agent_idx").on(t.agentId, t.decidedAt),
  ],
);

export const wsTruthRevisions = pgTable(
  "ws_truth_revisions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    factKey: text("fact_key").notNull(),
    previousValue: jsonb("previous_value").notNull(),
    newValue: jsonb("new_value").notNull(),
    effectiveFrom: tstz("effective_from").notNull(),
    observedAt: tstz("observed_at").notNull(),
    retroactive: boolean("retroactive").notNull(),
    receivedAt: createdAt(),
  },
  (t) => [
    unique("ws_truth_revisions_external_uq").on(t.workspaceId, t.externalId),
    check(
      "ws_truth_revisions_retro_chk",
      sql`${t.retroactive} = (${t.effectiveFrom} < ${t.observedAt})`,
    ),
  ],
);

export const wsIncidents = pgTable(
  "ws_incidents",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    revisionId: text("revision_id")
      .notNull()
      .references(() => wsTruthRevisions.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    severity: text("severity").notNull(),
    state: wsIncidentStateEnum("state").notNull().default("NEEDS_REVIEW"),
    /** Deterministic impact analysis result: affected and not-affected decisions with reasons. */
    impact: jsonb("impact").notNull(),
    openedAt: createdAt(),
    resolvedAt: tstz("resolved_at"),
    resolvedBy: text("resolved_by").references(() => user.id),
    resolutionNote: text("resolution_note"),
  },
  (t) => [
    unique("ws_incidents_revision_uq").on(t.workspaceId, t.revisionId),
    index("ws_incidents_workspace_idx").on(t.workspaceId, t.state),
    check(
      "ws_incidents_resolution_chk",
      sql`(${t.state} <> 'RESOLVED_BY_HUMAN') OR (${t.resolvedAt} IS NOT NULL AND ${t.resolvedBy} IS NOT NULL)`,
    ),
  ],
);
