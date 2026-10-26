import { Check } from "../ui/icons";
import { cn } from "../ui/cn";

export type StageState = "done" | "current" | "pending";
export interface Stage {
  label: string;
  state: StageState;
  detail?: string;
}

/** The lifecycle of one incident. State is text + shape + color, never color alone. */
export function ProofStrip({ stages }: { stages: Stage[] }) {
  return (
    <ol
      className="grid gap-4 sm:grid-cols-5 sm:gap-0"
      aria-label="Recovery progress"
      data-testid="proof-strip"
    >
      {stages.map((s, i) => (
        <li
          key={s.label}
          className="relative flex gap-3 sm:flex-col sm:gap-2 sm:pr-3"
          data-state={s.state}
        >
          {i < stages.length - 1 ? (
            <span
              aria-hidden
              className={cn(
                "absolute left-[0.85rem] top-8 h-[calc(100%-1rem)] w-0.5 sm:left-9 sm:top-[0.85rem] sm:h-0.5 sm:w-[calc(100%-2.5rem)]",
                s.state === "done"
                  ? "bg-recovery"
                  : s.state === "current"
                    ? "bg-signal"
                    : "bg-line-strong",
              )}
            />
          ) : null}
          <span
            className={cn(
              "relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 text-xs font-bold",
              s.state === "done" && "border-recovery bg-recovery text-signal-on",
              s.state === "current" && "border-signal bg-bg text-fg",
              s.state === "pending" && "border-line-strong bg-bg text-faint",
            )}
          >
            {s.state === "done" ? <Check size={15} strokeWidth={3} aria-hidden /> : i + 1}
          </span>
          <span>
            <span
              className={cn("block text-sm font-semibold", s.state === "pending" && "text-muted")}
            >
              {s.label}
            </span>
            <span className="block text-xs text-muted">
              {s.state === "done" ? "Done" : s.state === "current" ? "Waiting on you" : "Not yet"}
              {s.detail ? ` · ${s.detail}` : ""}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}
