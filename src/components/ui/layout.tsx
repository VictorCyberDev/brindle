import type { ReactNode } from "react";
import { cn } from "./cn";
import { AlertTriangle, CheckCircle2, CircleDashed, type LucideIcon } from "./icons";
import { Seam } from "../brand/seam";

export function Card({
  children,
  className,
  as: Tag = "section",
  ...rest
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article" | "li";
  "aria-labelledby"?: string;
  "data-testid"?: string;
}) {
  return (
    <Tag className={cn("rounded-lg bg-surface p-5 shadow-raise md:p-6", className)} {...rest}>
      {children}
    </Tag>
  );
}

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
}: {
  title: string;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow mb-2">{eyebrow}</p> : null}
        <h1 className="text-[1.75rem] font-semibold leading-tight md:text-[2rem]">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-[62ch] text-[1.02rem] text-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function SectionTitle({
  children,
  id,
  aside,
}: {
  children: ReactNode;
  id?: string;
  aside?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-4">
      <h2 id={id} className="text-lg font-semibold">
        {children}
      </h2>
      {aside ? <div className="text-sm text-muted">{aside}</div> : null}
    </div>
  );
}

const calloutTone = {
  neutral: { cls: "bg-sunken", icon: CircleDashed as LucideIcon, label: "Note" },
  recovery: { cls: "bg-recovery-wash", icon: CheckCircle2 as LucideIcon, label: "Verified" },
  evidence: { cls: "bg-evidence-wash", icon: AlertTriangle as LucideIcon, label: "Needs judgment" },
  critical: { cls: "bg-critical-wash", icon: AlertTriangle as LucideIcon, label: "Blocked" },
} as const;

export function Callout({
  tone = "neutral",
  title,
  children,
  className,
  ...rest
}: {
  tone?: keyof typeof calloutTone;
  title?: string;
  children: ReactNode;
  className?: string;
  "data-testid"?: string;
}) {
  const t = calloutTone[tone];
  const Icon = t.icon;
  return (
    <div className={cn("flex gap-3 rounded-lg p-4", t.cls, className)} role="note" {...rest}>
      <Icon size={20} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0 text-[0.95rem]">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className={title ? "mt-1 text-muted" : ""}>{children}</div>
      </div>
    </div>
  );
}

/** Empty states teach the next action and may carry the Seam. */
export function EmptyState({
  title,
  children,
  action,
  seam = false,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  seam?: boolean;
}) {
  return (
    <div
      className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-line-strong p-8"
      data-testid="empty-state"
    >
      {seam ? <Seam state="verified" className="mb-1 h-8 w-44 text-fg" /> : null}
      <p className="text-lg font-semibold">{title}</p>
      {children ? <div className="max-w-[56ch] text-muted">{children}</div> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

export function DataList({
  items,
  className,
}: {
  items: { label: string; value: ReactNode }[];
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid grid-cols-[minmax(0,10rem)_1fr] gap-x-6 gap-y-3 text-[0.95rem]",
        className,
      )}
    >
      {items.map((i) => (
        <div key={i.label} className="contents">
          <dt className="text-muted">{i.label}</dt>
          <dd className="min-w-0 break-words">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton h-4 w-full", className)} aria-hidden />;
}

/** Monospace is reserved for identifiers, hashes and structured evidence. */
export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <code className={cn("font-mono text-[0.82em] break-all", className)}>{children}</code>;
}
