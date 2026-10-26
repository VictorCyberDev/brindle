import Link from "next/link";
import type { ReactNode } from "react";
import { Seam, Wordmark } from "../../components/brand/seam";
import { ThemeToggle } from "../../components/ui/client";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <main id="main" className="flex flex-col px-6 py-8 sm:px-12">
        <div className="flex items-center justify-between">
          <Link href="/" aria-label="Brindle Recovery home">
            <Wordmark />
          </Link>
          <ThemeToggle />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          {children}
        </div>
        <p className="text-sm text-muted">
          Private beta. No billing. Your data stays in your workspace.
        </p>
      </main>
      <aside
        className="relative hidden flex-col justify-between overflow-hidden bg-ink p-12 text-paper lg:flex"
        aria-hidden
      >
        <p className="display text-6xl">
          Your agent did the right thing.
          <br />
          <span className="italic text-[var(--signal-fill)]">Then the truth changed.</span>
        </p>
        <div>
          <Seam state="verified" animate className="h-14 w-full max-w-md text-paper" />
          <p className="mt-4 max-w-md text-paper/70">
            Recover only what became wrong. Preserve everything else. Prove it.
          </p>
        </div>
      </aside>
    </div>
  );
}
