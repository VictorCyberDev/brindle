"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { authClient } from "../../lib/auth-client";
import { Wordmark } from "../brand/seam";
import { ThemeToggle } from "../ui/client";
import { Button } from "../ui/button";
import { LogOut, Menu, X } from "../ui/icons";
import { AppNav } from "./app-nav";

export interface ShellProps {
  children: ReactNode;
  workspaceName: string;
  isDemo: boolean;
  modeLabel: string;
  userName: string;
  attention: number;
  switcher: ReactNode;
}

export function AppShell({
  children,
  workspaceName,
  isDemo,
  modeLabel,
  userName,
  attention,
  switcher,
}: ShellProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[17rem_1fr]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r border-line bg-bg px-4 py-5 lg:flex">
        <Link href="/app" aria-label="Brindle Recovery overview" className="px-3">
          <Wordmark />
        </Link>
        <div className="px-1">{switcher}</div>
        <div className="min-h-0 flex-1">
          <AppNav attention={attention} />
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-bg/95 px-4 py-3 backdrop-blur sm:px-8">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="lg:hidden"
              aria-label="Open menu"
              aria-expanded={open}
              onClick={() => setOpen(true)}
            >
              <Menu size={18} aria-hidden />
            </Button>
            <span className="truncate text-sm text-muted">
              <span className="font-semibold text-fg">{workspaceName}</span>
              <span aria-hidden> · </span>
              <span data-testid="mode-pill">{modeLabel}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle className="max-sm:hidden" />
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await authClient.signOut();
                router.replace("/");
                router.refresh();
              }}
              aria-label={`Sign out ${userName}`}
            >
              <LogOut size={16} aria-hidden />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </header>

        {isDemo ? (
          <div
            className="border-b border-line bg-evidence-wash px-4 py-2 text-sm sm:px-8"
            data-testid="demo-banner"
          >
            <strong className="font-semibold tracking-wide">DEMO DATA</strong>
            <span className="text-muted">
              {" "}
              · A recorded run of Brindle&apos;s real engine in a sandbox. Not your data, and
              nothing here touches a real system.
            </span>
          </div>
        ) : null}

        <main id="main" className="mx-auto max-w-[68rem] px-4 py-8 sm:px-8 sm:py-10">
          {children}
        </main>
      </div>

      {/* Mobile drawer */}
      {open ? (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
        >
          <button
            className="absolute inset-0 bg-ink/55"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-[min(20rem,86vw)] flex-col gap-6 bg-bg px-4 py-5 shadow-pop">
            <div className="flex items-center justify-between px-3">
              <Wordmark />
              <Button
                variant="ghost"
                size="sm"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
              >
                <X size={18} aria-hidden />
              </Button>
            </div>
            <div className="px-1">{switcher}</div>
            <div className="min-h-0 flex-1">
              <AppNav attention={attention} onNavigate={() => setOpen(false)} />
            </div>
            <div className="flex items-center justify-between px-3 sm:hidden">
              <span className="text-sm text-muted">Theme</span>
              <ThemeToggle />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
