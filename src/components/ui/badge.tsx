import type { ReactNode } from "react";
import { cn } from "./cn";
import type { LucideIcon } from "./icons";

export type Tone = "recovery" | "evidence" | "critical" | "signal" | "neutral";

const tones: Record<Tone, string> = {
  recovery: "bg-recovery-wash text-recovery-text",
  evidence: "bg-evidence-wash text-evidence-text",
  critical: "bg-critical-wash text-critical-text",
  signal: "bg-signal-wash text-signal-text",
  neutral: "bg-sunken text-muted",
};

/**
 * Status is never colour-only: every StatusBadge carries an icon AND a text label.
 */
export function StatusBadge({
  tone,
  icon: Icon,
  children,
  className,
  "data-testid": testId,
}: {
  tone: Tone;
  icon: LucideIcon;
  children: ReactNode;
  className?: string;
  "data-testid"?: string;
}) {
  return (
    <span
      data-testid={testId}
      data-tone={tone}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold leading-none",
        tones[tone],
        className,
      )}
    >
      <Icon size={14} strokeWidth={2} aria-hidden />
      {children}
    </span>
  );
}

export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border border-line px-1.5 py-0.5 text-xs font-medium text-muted",
        className,
      )}
    >
      {children}
    </span>
  );
}
