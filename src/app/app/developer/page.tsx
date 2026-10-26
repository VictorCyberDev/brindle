import { headers } from "next/headers";
import Link from "next/link";
import { CopyButton } from "../../../components/ui/client";
import { Callout, Card, EmptyState, PageHeader, SectionTitle } from "../../../components/ui/layout";
import { getConfig, summarizeConfig } from "../../../config/env";
import { formatDate } from "../../../product/format";
import { can } from "../../../product/permissions";
import { listApiKeys } from "../../../server/api-keys";
import { getProductDb } from "../../../server/db";
import { requireWorkspace } from "../../../server/session";
import { IssueKeyForm, RevokeKeyForm } from "./key-form";

export const metadata = { title: "Developer" };

export default async function DeveloperPage() {
  const ctx = await requireWorkspace("/app/developer");
  const { db } = await getProductDb();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const base = `${proto}://${host}`;
  const demo = ctx.active.kind === "DEMO";
  const manage = can(ctx.active.role, "apikey.manage");
  const keys = demo ? [] : await listApiKeys(db, ctx.active.workspaceId);
  const cfg = summarizeConfig(getConfig());

  const decision = `curl -sS -X POST ${base}/api/v1/decisions \\
  -H "Authorization: Bearer $BRINDLE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "agent": { "name": "Procurement agent" },
    "decisionId": "po-1042-approve",
    "decidedAt": "2026-03-02T09:15:00Z",
    "summary": "Approved PO-1042 with Acme Metals",
    "action": { "type": "approve_purchase_order", "target": "PO-1042" },
    "truthInputs": [
      { "subjectType": "supplier", "subjectId": "SUP-ACME",
        "factKey": "certification.status", "value": "VALID" }
    ],
    "consequences": [
      { "objectType": "purchase_order", "objectId": "PO-1042",
        "description": "Purchase order approved", "reversibility": "REVERSIBLE" }
    ]
  }'`;
  const revision = `curl -sS -X POST ${base}/api/v1/truth-revisions \\
  -H "Authorization: Bearer $BRINDLE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "revisionId": "acme-cert-revoked",
    "subjectType": "supplier", "subjectId": "SUP-ACME",
    "factKey": "certification.status",
    "previousValue": "VALID", "newValue": "REVOKED",
    "effectiveFrom": "2026-03-01T00:00:00Z",
    "observedAt": "2026-03-09T08:00:00Z"
  }'`;

  return (
    <>
      <PageHeader
        title="Developer"
        description="Send decisions and truth changes from your own agents. Evidence in, incident out."
      />
      <Callout tone="evidence" title="This API only receives evidence.">
        There is no endpoint that runs an action or grants authority. A key can write decisions and
        facts for this workspace and read this workspace&apos;s incidents. Nothing else.
      </Callout>

      <section className="mt-10" aria-labelledby="keys">
        <SectionTitle id="keys">API keys</SectionTitle>
        {demo ? (
          <EmptyState title="The demo workspace has no API keys">
            Create your own workspace to connect an agent. Demo data is read-only.
          </EmptyState>
        ) : (
          <>
            {keys.length ? (
              <ul
                className="mb-6 divide-y divide-line rounded-lg bg-surface shadow-raise"
                data-testid="key-list"
              >
                {keys.map((k) => (
                  <li
                    key={k.id}
                    className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <span>
                      <span className="block font-semibold">{k.label}</span>
                      <span className="block font-mono text-sm text-muted">{k.prefix}…</span>
                      <span className="block text-sm text-muted">
                        Created {formatDate(k.createdAt.toISOString())} ·{" "}
                        {k.revokedAt
                          ? `Revoked ${formatDate(k.revokedAt.toISOString())}`
                          : k.lastUsedAt
                            ? `Last used ${formatDate(k.lastUsedAt.toISOString())}`
                            : "Never used"}
                      </span>
                    </span>
                    {manage && !k.revokedAt ? <RevokeKeyForm keyId={k.id} /> : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {manage ? (
              <Card>
                <h3 className="mb-3 font-semibold">Create a key</h3>
                <IssueKeyForm />
              </Card>
            ) : (
              <p className="text-muted">Only owners and admins can create keys.</p>
            )}
          </>
        )}
      </section>

      <section className="mt-10" aria-labelledby="qs">
        <SectionTitle id="qs">Quickstart</SectionTitle>
        <p className="mb-4 max-w-[62ch] text-muted">
          Two calls. First tell Brindle what your agent decided and which facts it relied on. Then
          tell Brindle when one of those facts turned out to be different.
        </p>
        {[
          ["1. Record a decision", decision],
          ["2. Report a truth change", revision],
        ].map(([title, code]) => (
          <Card key={title} className="mb-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="font-semibold">{title}</h3>
              <CopyButton value={code!} />
            </div>
            <pre className="overflow-x-auto rounded-md bg-sunken p-4 font-mono text-xs leading-relaxed">
              {code}
            </pre>
          </Card>
        ))}
        <p className="text-sm text-muted">
          Full reference:{" "}
          <Link className="underline underline-offset-4" href="/docs/api">
            API docs
          </Link>
          . Machine-readable:{" "}
          <a className="underline underline-offset-4" href="/api/v1/openapi.json">
            OpenAPI
          </a>
          .
        </p>
      </section>

      <section className="mt-10" aria-labelledby="env">
        <SectionTitle id="env">Environment</SectionTitle>
        <Card>
          <dl className="grid grid-cols-[10rem_1fr] gap-y-2 text-sm">
            <dt className="text-muted">Provider mode</dt>
            <dd>{cfg.providerMode}</dd>
            <dt className="text-muted">Database</dt>
            <dd>{cfg.integrations.database}</dd>
            <dt className="text-muted">Auth</dt>
            <dd>{cfg.integrations.auth}</dd>
          </dl>
        </Card>
      </section>
    </>
  );
}
