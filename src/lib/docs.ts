import { readFileSync } from "node:fs";
import path from "node:path";
import { marked } from "marked";

export const DOCS = [
  { slug: "getting-started", title: "Getting started" },
  { slug: "concepts", title: "Concepts" },
  { slug: "modes", title: "Recovery modes" },
  { slug: "api", title: "API reference" },
  { slug: "data-handling", title: "Data handling" },
  { slug: "troubleshooting", title: "Troubleshooting" },
] as const;

/** Docs are authored in this repository, so rendering them without sanitizing is safe. */
export function renderDoc(slug: string): string | null {
  if (!DOCS.some((d) => d.slug === slug)) return null;
  const file = path.join(process.cwd(), "content", "docs", `${slug}.md`);
  return marked.parse(readFileSync(file, "utf8"), { async: false }) as string;
}
