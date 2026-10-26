import Link from "next/link";
import { notFound } from "next/navigation";
import { ProofDocument } from "../../../../components/product/proof-document";
import { loadIncident } from "../../../../server/data";
import { requireWorkspace } from "../../../../server/session";

export const metadata = { title: "Recovery Proof" };

export default async function RecoveryProofPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireWorkspace(`/app/recoveries/${id}`);
  const incident = await loadIncident(ctx.active, id);
  if (!incident?.proof) notFound();
  return (
    <>
      <p className="mb-4 text-sm">
        <Link href={`/app/incidents/${id}`} className="underline underline-offset-4">
          Back to the incident
        </Link>
      </p>
      <ProofDocument
        incident={incident}
        downloadHref={`/app/recoveries/${id}/receipt`}
        shareUrl={incident.source === "DEMO" ? `/proof/${id}` : undefined}
      />
    </>
  );
}
