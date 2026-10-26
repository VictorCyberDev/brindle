"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BookOpen,
  Brain,
  Code2,
  Inbox,
  Layers,
  Plug,
  ScrollText,
  Settings,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "../ui/icons";
import { cn } from "../ui/cn";

interface Item {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

const PRIMARY: Item[] = [
  { href: "/app", label: "Overview", icon: Activity, exact: true },
  { href: "/app/incidents", label: "Incidents", icon: Inbox },
  { href: "/app/recoveries", label: "Recoveries", icon: ShieldCheck },
  { href: "/app/memory", label: "Memory", icon: Brain },
  { href: "/app/agents", label: "Agents", icon: Layers },
  { href: "/app/policies", label: "Policies", icon: ScrollText },
  { href: "/app/integrations", label: "Integrations", icon: Plug },
];
const SECONDARY: Item[] = [
  { href: "/app/team", label: "Team", icon: Users },
  { href: "/app/settings", label: "Settings", icon: Settings },
  { href: "/app/developer", label: "Developer", icon: Code2 },
  { href: "/docs", label: "Help & docs", icon: BookOpen },
];

function NavLink({
  item,
  badge,
  onNavigate,
}: {
  item: Item;
  badge?: number;
  onNavigate?: () => void;
}) {
  const path = usePathname();
  const active = item.exact
    ? path === item.href
    : path === item.href || path.startsWith(`${item.href}/`);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center gap-3 rounded-md px-3 py-2 text-[0.95rem] transition-colors duration-150",
        active ? "bg-sunken font-semibold text-fg" : "text-muted hover:bg-sunken hover:text-fg",
      )}
    >
      {/* Signal marks the current location: a short bar, not a filled block. */}
      {active ? (
        <span
          aria-hidden
          className="absolute -left-3 top-2 h-[calc(100%-1rem)] w-[3px] rounded-full bg-signal"
        />
      ) : null}
      <Icon size={18} strokeWidth={1.75} aria-hidden />
      <span className="flex-1">{item.label}</span>
      {badge ? (
        <span
          className="rounded-full bg-signal px-2 py-0.5 text-xs font-bold text-signal-on"
          aria-label={`${badge} need attention`}
        >
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

export function AppNav({ attention, onNavigate }: { attention: number; onNavigate?: () => void }) {
  return (
    <nav aria-label="Primary" className="flex h-full flex-col gap-1 pl-3">
      <div className="space-y-0.5">
        {PRIMARY.map((i) => (
          <NavLink
            key={i.href}
            item={i}
            badge={i.href === "/app/incidents" ? attention : undefined}
            onNavigate={onNavigate}
          />
        ))}
      </div>
      <div className="mt-auto space-y-0.5 border-t border-line pt-3">
        {SECONDARY.map((i) => (
          <NavLink key={i.href} item={i} onNavigate={onNavigate} />
        ))}
      </div>
    </nav>
  );
}
