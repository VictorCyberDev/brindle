import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "../../components/brand/seam";
import { buttonClass } from "../../components/ui/button";
import { ThemeToggle } from "../../components/ui/client";

const NAV = [
  { href: "/demo", label: "Product tour" },
  { href: "/docs", label: "Docs" },
  { href: "/security", label: "Security" },
  { href: "/pricing", label: "Pricing" },
];

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
          <Link href="/" aria-label="Brindle Recovery home">
            <Wordmark />
          </Link>
          <nav aria-label="Primary" className="hidden items-center gap-6 md:flex">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="text-[0.95rem] text-muted hover:text-fg">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle className="max-sm:hidden" />
            <Link
              href="/sign-in"
              className="hidden px-2 text-[0.95rem] text-muted hover:text-fg sm:inline"
            >
              Sign in
            </Link>
            <Link href="/beta" className={buttonClass("primary", "md")}>
              Request access
            </Link>
          </div>
        </div>
        <nav aria-label="Primary mobile" className="flex gap-5 overflow-x-auto px-5 pb-2 md:hidden">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="shrink-0 text-sm text-muted">
              {n.label}
            </Link>
          ))}
        </nav>
      </header>
      <main id="main">{children}</main>
      <footer className="mt-24 border-t border-line">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Wordmark />
            <p className="mt-3 max-w-[40ch] text-sm text-muted">
              The recovery plane for AI agents. Private beta. Brindle Recovery is a working name;
              see our note on naming.
            </p>
          </div>
          <nav aria-label="Product" className="text-sm">
            <p className="mb-2 font-semibold">Product</p>
            <ul className="space-y-1.5 text-muted">
              <li>
                <Link href="/demo">Product tour</Link>
              </li>
              <li>
                <Link href="/docs">Documentation</Link>
              </li>
              <li>
                <Link href="/pricing">Pricing</Link>
              </li>
              <li>
                <Link href="/beta">Request access</Link>
              </li>
            </ul>
          </nav>
          <nav aria-label="Trust" className="text-sm">
            <p className="mb-2 font-semibold">Trust</p>
            <ul className="space-y-1.5 text-muted">
              <li>
                <Link href="/security">Security and data handling</Link>
              </li>
              <li>
                <Link href="/docs/data-handling">What we store</Link>
              </li>
              <li>
                <Link href="/api/health">System status</Link>
              </li>
            </ul>
          </nav>
        </div>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 pb-6 sm:hidden">
          <span className="text-sm text-muted">Theme</span>
          <ThemeToggle />
        </div>
        <p className="border-t border-line px-5 py-5 text-center text-xs text-muted">
          No customer logos, certifications or integrations are claimed on this site that do not
          exist. Demo data is always labeled.
        </p>
      </footer>
    </>
  );
}
