import type { CSSProperties } from "react";

/**
 * THE BRINDLE SEAM. A line moves forward (valid state), breaks where the truth changed, follows a
 * corrected path, and reconnects into one verified line.
 *
 *   valid      ──────
 *   break      ──────╎            (the truth break)
 *   recovering ──────╎  ╭──╮     (corrected path)
 *   verified   ──────╎  ╭──╮──●  (reconnected, verified)
 *
 * Use it where it explains state (lifecycle, progress, proof, empty and loading states, brand
 * moments). It is not a decoration for ordinary components (docs/brand/BRAND_SYSTEM.md).
 */
export type SeamState = "valid" | "break" | "recovering" | "verified";

const ORDER: SeamState[] = ["valid", "break", "recovering", "verified"];
const reached = (state: SeamState, at: SeamState) => ORDER.indexOf(state) >= ORDER.indexOf(at);

export function Seam({
  state = "verified",
  animate = false,
  loading = false,
  className,
  label,
  strokeWidth = 3,
}: {
  state?: SeamState;
  animate?: boolean;
  /** Pulses the corrected path while work is in flight. */
  loading?: boolean;
  className?: string;
  label?: string;
  strokeWidth?: number;
}) {
  const cls = [animate ? "seam-animate" : "", loading ? "seam-loading" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");
  const delay = (ms: number): CSSProperties => ({ ["--seam-delay" as string]: `${ms}ms` });
  return (
    <svg
      viewBox="0 0 280 44"
      className={cls}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* valid line */}
      <path
        className="seam-path"
        pathLength={1}
        d="M6 16 H92"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        style={delay(0)}
      />
      {/* truth break: a short tick where the fact changed */}
      {reached(state, "break") && (
        <path
          className="seam-path"
          pathLength={1}
          d="M100 6 V26"
          stroke="var(--signal-fill)"
          strokeWidth={strokeWidth}
          style={delay(300)}
        />
      )}
      {/* corrected path */}
      {reached(state, "recovering") && (
        <path
          className="seam-path seam-path-fix"
          pathLength={1}
          d="M110 16 C 126 16, 122 34, 140 34 C 158 34, 154 16, 170 16"
          stroke="var(--signal-fill)"
          strokeWidth={strokeWidth}
          style={delay(500)}
        />
      )}
      {/* reconnected, verified line */}
      {reached(state, "verified") && (
        <>
          <path
            className="seam-path"
            pathLength={1}
            d="M170 16 H262"
            stroke="var(--recovery-fill)"
            strokeWidth={strokeWidth}
            style={delay(900)}
          />
          <circle cx="270" cy="16" r="4.5" fill="var(--recovery-fill)" />
        </>
      )}
    </svg>
  );
}

/** Compact mark: the same line, break and corrected detour. Ink + Signal at small sizes. */
export function SeamMark({
  size = 28,
  className,
  title,
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={(size * 24) / 40}
      viewBox="0 0 40 24"
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 9 H13" stroke="currentColor" strokeWidth="3" />
      <path d="M17 3 V14" stroke="var(--signal-fill)" strokeWidth="3" />
      <path
        d="M21 9 C 25 9, 23 18, 28 18 C 33 18, 31 9, 35 9 H37"
        stroke="var(--signal-fill)"
        strokeWidth="3"
      />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <SeamMark size={30} />
      <span className="text-[1.15rem] font-semibold tracking-tight">Brindle</span>
    </span>
  );
}
