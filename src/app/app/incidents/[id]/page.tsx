import Link from "next/link";
import { notFound } from "next/navigation";
import { IncidentDetail } from "../../../../components/product/incident-detail";
import { ResolveIncident } from "../../../../components/product/resolve-incident";
import { loadIncident } from "../../../../server/data";
import { requireWorkspace } from "../../../../server/session";
import { can } from "../../../../product/permissions";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return { title: `Incident ${(await params).id}` };
}

export default async function IncidentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireWorkspace(`/app/incidents/${id}`);
  const incident = await loadIncident(ctx.active, id);
  if (!incident) notFound();
  const reviewable =
    incident.source === "WORKSPACE" &&
    incident.status === "NEEDS_REVIEW" &&
    can(ctx.active.role, "incident.review");
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted">
        <Link href="/app/incidents" className="hover:text-fg">
          Incidents
        </Link>
        <span aria-hidden> / </span>
        <span className="text-fg">{incident.title}</span>
      </nav>
      <IncidentDetail incident={incident} role={ctx.active.role} mode={ctx.active.mode} />
      {reviewable ? <ResolveIncident incidentId={incident.id} /> : null}
    </>
  );
}
