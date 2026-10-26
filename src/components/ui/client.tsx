"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useFormStatus } from "react-dom";
import { Button } from "./button";
import { cn } from "./cn";
import { Check, Copy, Monitor, Moon, Sun, X } from "./icons";

/* ----------------------------- theme ----------------------------- */

export type ThemePreference = "light" | "dark" | "system";
const STORAGE_KEY = "brindle-theme";

export function applyTheme(pref: ThemePreference) {
  const dark =
    pref === "dark" ||
    (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.dataset.themePreference = pref;
}

export function ThemeToggle({ className }: { className?: string }) {
  const [pref, setPref] = useState<ThemePreference>("system");
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      /* storage may be blocked; fall back to system */
    }
    const initial = stored === "light" || stored === "dark" ? stored : "system";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser-only storage after mount
    setPref(initial);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => initial === "system" && applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const choose = (next: ThemePreference) => {
    setPref(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    applyTheme(next);
  };
  const options: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
    { value: "light", label: "Light theme", Icon: Sun },
    { value: "system", label: "Match system theme", Icon: Monitor },
    { value: "dark", label: "Dark theme", Icon: Moon },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={cn("inline-flex rounded-md border border-line p-0.5", className)}
    >
      {options.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={pref === value}
          aria-label={label}
          title={label}
          onClick={() => choose(value)}
          className={cn(
            "grid h-8 w-8 place-items-center rounded-sm text-muted transition-colors duration-150",
            pref === value && "bg-sunken text-fg",
          )}
        >
          <Icon size={15} strokeWidth={1.75} aria-hidden />
        </button>
      ))}
    </div>
  );
}

/* ------------------------- double-submit safety ------------------------- */

/** Disables itself while its form is submitting, so a double click can never submit twice. */
export function SubmitButton({
  children,
  pendingLabel = "Working…",
  variant = "primary",
  className,
  "data-testid": testId,
}: {
  children: ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  className?: string;
  "data-testid"?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      disabled={pending}
      aria-disabled={pending}
      className={className}
      data-testid={testId}
    >
      {pending ? pendingLabel : children}
    </Button>
  );
}

/* ------------------------------ copy ------------------------------ */

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {
          /* clipboard unavailable: the value is also shown on screen */
        }
      }}
    >
      {done ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
      {done ? "Copied" : label}
    </Button>
  );
}

/* --------------------------- dialog & drawer --------------------------- */

/**
 * Native <dialog>: the browser traps focus, makes the page inert, closes on Escape and returns
 * focus to the trigger. We only add labelling and a light-dismiss on backdrop click.
 */
function ModalShell({
  open,
  onClose,
  title,
  children,
  side,
  describedBy,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  side?: boolean;
  describedBy?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={describedBy}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        "m-auto max-h-[90dvh] w-[min(36rem,calc(100vw-2rem))] overflow-hidden rounded-lg bg-surface p-0 text-fg shadow-pop backdrop:bg-ink/55",
        side && "m-0 ml-auto h-dvh max-h-none w-[min(34rem,100vw)] rounded-none rounded-l-lg",
      )}
    >
      <div className="flex max-h-[inherit] flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-sunken"
          >
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </dialog>
  );
}

/** A consequence-specific confirmation: the action label names exactly what will happen. */
export function ConfirmAction({
  trigger,
  title,
  consequences,
  confirmLabel,
  tone = "primary",
  onConfirm,
  triggerVariant = "primary",
  testId,
}: {
  trigger: string;
  title: string;
  consequences: ReactNode;
  confirmLabel: string;
  tone?: "primary" | "danger";
  onConfirm: () => Promise<void> | void;
  triggerVariant?: "primary" | "secondary" | "danger";
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = useCallback(async () => {
    if (busy) return; // double-click safe
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      setOpen(false);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "That did not go through. Nothing was changed. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }, [busy, onConfirm]);
  return (
    <>
      <Button variant={triggerVariant} onClick={() => setOpen(true)} data-testid={testId}>
        {trigger}
      </Button>
      <ModalShell open={open} onClose={() => !busy && setOpen(false)} title={title}>
        <div className="space-y-4 text-[0.95rem]">
          <div>{consequences}</div>
          {error ? (
            <p role="alert" className="rounded-md bg-critical-wash p-3 text-critical-text">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant={tone === "danger" ? "danger" : "primary"}
              onClick={confirm}
              disabled={busy}
              data-testid={testId ? `${testId}-confirm` : undefined}
            >
              {busy ? "Working…" : confirmLabel}
            </Button>
          </div>
        </div>
      </ModalShell>
    </>
  );
}

/** Advanced evidence lives in a drawer: raw ids and JSON only appear when asked for. */
export function EvidenceDrawer({
  label = "View evidence",
  title = "Evidence",
  children,
}: {
  label?: string;
  title?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} data-testid="open-evidence">
        {label}
      </Button>
      <ModalShell open={open} onClose={() => setOpen(false)} title={title} side>
        {children}
      </ModalShell>
    </>
  );
}

/* ------------------------------ toast ------------------------------ */

interface Toast {
  id: number;
  message: string;
  tone: "info" | "error";
}
const ToastContext = createContext<(message: string, tone?: Toast["tone"]) => void>(
  () => undefined,
);
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, tone: Toast["tone"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5200);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        role="status"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((t) => (
          <p
            key={t.id}
            className={cn(
              "pointer-events-auto rise-in max-w-md rounded-md px-4 py-3 text-sm shadow-pop",
              t.tone === "error" ? "bg-critical text-signal-on" : "bg-ink text-paper",
            )}
          >
            {t.message}
          </p>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ----------------------------- refresh ----------------------------- */

export function RefreshButton({ label = "Try again" }: { label?: string }) {
  const router = useRouter();
  return (
    <Button variant="secondary" onClick={() => router.refresh()}>
      {label}
    </Button>
  );
}
