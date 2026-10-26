import { notFound } from "next/navigation";
import { ProofDocument } from "../../../../components/product/proof-document";
import { buildDemoIncident } from "../../../../product/dossier";
import { getStory } from "../../../../story/get";

export const dynamicParams = false;
export const generateStaticParams = () => [{ id: "demo-atlas" }, { id: "demo-cedar" }];
export const metadata = { title: "Recovery Proof (demo)", robots: { index: false } };

/** Only the recorded DEMO proofs are public. Customer workspaces have no public proof pages. */
export default async function PublicProofPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const key = id === "demo-atlas" ? "A" : id === "demo-cedar" ? "B" : null;
  if (!key) notFound();
  const incident = buildDemoIncident(getStory(), key, { mode: "APPROVAL", approvedB: true });
  if (!incident.proof) notFound();
  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <ProofDocument incident={incident} downloadHref={`/proof/${id}/receipt`} />
    </div>
  );
}
