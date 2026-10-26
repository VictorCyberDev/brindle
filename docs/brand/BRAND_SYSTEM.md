# Brindle Recovery: brand system

Display name: **Brindle Recovery**. See `docs/BRAND_NAMING_RISK.md` for why this is a working name
and how to rename safely.

## Idea

Brindle is a pattern of streaks on an otherwise solid coat. Our streak is **the Seam**: a line that
runs true, breaks where a fact changed, follows a corrected path, and reconnects as one verified
line. The product does exactly that to a business.

## THE BRINDLE SEAM

States (`src/components/brand/seam.tsx`): `valid` (line), `break` (signal tick), `recovering`
(corrected path), `verified` (reconnected line and a recovery-green end point).

Use it where it **explains state**: incident lifecycle, proof, empty and loading states, brand
moments (hero, auth, tour). Do not use it as decoration on ordinary components.

## Color

| Token    | Light                              | Use                                                      |
| -------- | ---------------------------------- | -------------------------------------------------------- |
| Paper    | `#f6f1e8`                          | Page background (warm, never pure white)                 |
| Ink      | `#11100e`                          | Text, dark surfaces                                      |
| Signal   | `#ff5a2a`                          | Primary action, the break. Text on Signal is Ink (6.1:1) |
| Recovery | `#1fad7a` / text `#0e7a55` (4.8:1) | Verified, preserved, done                                |
| Evidence | `#e5b644` / text darker            | Needs a person, advisory, memory                         |
| Critical | `#d94b3d` / text `#b53326` (5.4:1) | Cannot be undone, failed                                 |

Rules: status is **never color alone**; every state has a label and an icon. Text colors are separate
tokens tuned for contrast. Dark theme redefines every token (`:root[data-theme="dark"]`).
Light, dark and system are all supported, and the choice persists.

## Typography

- **Instrument Serif** for display headlines (the voice: confident, editorial).
- **Instrument Sans** for UI and body.
- **IBM Plex Mono** only for identifiers, hashes and evidence.
- All three are SIL OFL, self-hosted through `@fontsource`, no third-party requests.

## Voice

Plain and exact. Say what happened, what Brindle will and will not do, and what a person must
decide. Never say "AI-powered", "seamless" or "magic". Never claim a certification, customer or
connector that does not exist. Always label demo data **DEMO DATA**.

## Components and tokens

Tokens live in `src/app/globals.css` (`:root`, `@theme inline`). Reusable components are in
`src/components/ui` (Button, StatusBadge, Card, PageHeader, SectionTitle, Callout, EmptyState,
DataList, ConfirmAction, EvidenceDrawer, ToastProvider) and `src/components/product` (ProofStrip,
ImpactMap, IncidentCard, status badges, ProofDocument).

## Icons

One family: Lucide line icons at one stroke weight, re-exported from `src/components/ui/icons.tsx`
so imports stay uniform.

## Motion

- Purposeful and short: 150 to 250 ms for interface, the Seam draws once (about 1.2 s) on brand moments.
- `prefers-reduced-motion: reduce` turns every animation and transition into an instant state change.
- Nothing loops except the loading Seam, and that stops under reduced motion.

## Accessibility

Skip link, visible focus ring on every control, native `<dialog>` for modals (focus trap and Escape
for free), `aria-live` for tour progress and toasts, 44 px targets for primary actions, layouts
checked at 375, 768 and 1440 px with no horizontal scroll, and contrast tokens above AA for body
text. This is WCAG-aware design, not a certified audit.
