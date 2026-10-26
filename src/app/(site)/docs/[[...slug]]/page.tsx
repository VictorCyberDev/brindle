import Link from "next/link";
import { notFound } from "next/navigation";
import { DOCS, renderDoc } from "../../../../lib/docs";
import { cn } from "../../../../components/ui/cn";

export const dynamicParams = false;
export function generateStaticParams() {
  return [{ slug: [] }, ...DOCS.map((d) => ({ slug: [d.slug] }))];
}

export async function generateMetadata({ params }: { params: Promise<{ slug?: string[] }> }) {
  const slug = (await params).slug?.[0] ?? "getting-started";
  const doc = DOCS.find((d) => d.slug === slug);
  return { title: doc ? `${doc.title} · Docs` : "Docs" };
}

export default async function DocsPage({ params }: { params: Promise<{ slug?: string[] }> }) {
  const parts = (await params).slug ?? [];
  if (parts.length > 1) notFound();
  const slug = parts[0] ?? "getting-started";
  const html = renderDoc(slug);
  if (!html) notFound();
  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 grid-cols-[minmax(0,1fr)] md:grid-cols-[14rem_minmax(0,1fr)]">
      <nav aria-label="Documentation" className="md:sticky md:top-24 md:self-start">
        <p className="eyebrow mb-3">Documentation</p>
        <ul className="flex gap-4 overflow-x-auto md:block md:space-y-1">
          {DOCS.map((d) => (
            <li key={d.slug} className="shrink-0">
              <Link
                href={`/docs/${d.slug}`}
                aria-current={d.slug === slug ? "page" : undefined}
                className={cn(
                  "block rounded px-2 py-1.5 text-[0.95rem]",
                  d.slug === slug ? "bg-sunken font-semibold" : "text-muted hover:text-fg",
                )}
              >
                {d.title}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <article
        className="prose-brindle min-w-0"
        data-testid="doc"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
