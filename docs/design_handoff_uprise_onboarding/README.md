# Handoff: Uprise Onboarding (role-layered setup, tracking + gating)

## Overview
This design replaces the two-step getting-started checklist with a **role-layered setup
system**: per-role flows (Self setup / Organisation setup / Your channels) with status chips,
a **floating setup tracker** (bottom-left pill → popover), a **locked-until-setup** control
pattern, plan-gated own-channel provisioning, and a request-based email-identity flow. Sending
on shared Uprise numbers/addresses is never blocked — the design says so out loud wherever a
lock appears.

The interactive prototype is a single self-contained file: **`Uprise Onboarding.dc.html`**.
The dark "prototype" strip at the top switches between the nine screens; the locked-control
popovers (S8) and the email request flip (S9) are live interactions.

## About the design file
It is a **design reference created in HTML/JS** demonstrating intended look, layout, copy and
behaviour — **not production code**. Recreate these designs in the Uprise codebase (Next.js 14
App Router, `@uprise/ui` primitives via the `@/components/ui/*` shim, Tailwind v4 CSS-first
tokens) using its established patterns. The prototype uses inline hexes so it can render
standalone; the app must use **token utilities only** (`bg-primary`, `bg-warning-container`,
`text-warning-foreground`, `bg-surface`, `border-border`, `shadow-card`, `animate-fade-up`,
`tabular-nums`) — never raw hex.

## Fidelity
High-fidelity: colours, spacing, copy, chip language and the interactions are as-built intent.
Deliberately faked: sample data, the provisioning run's live progress, and the admin shell
chrome (the real shell/sidebar/topbar already exist — screens S1–S7 render inside the existing
`(main)` layout).

---

## Design tokens (prototype hex → app token)

| Prototype hex | App token / utility |
|---|---|
| `#465fff` | `--primary` → `bg-primary`, `text-primary`, `stroke-primary` |
| `#e8ecff` | `--primary-container` → `bg-primary-container` |
| `#16181d` | `--foreground` → `text-foreground` |
| `#6b7280` | `--muted-foreground` → `text-muted-foreground` |
| `#e6e8ec` | `--border` → `border-border` |
| `#f5f6f8` | `--background` → `bg-background` |
| `#ffffff` | `--surface` → `bg-surface` |
| `#eef0f3` | `--surface-variant` → `bg-surface-variant` |
| `#16a34a` / `#e7f6ec` | `--success` / `--success-container` |
| `#92600e` / `#fef3e2` | `--warning-foreground` / `--warning-container` |
| `#dc2626` / `#fdeaea` | `--error` / `--error-container` |
| card shadow | `shadow-card`; popovers/tracker `shadow-elevated`-equivalent |
| fadeUp/popIn | `animate-fade-up` (existing); popover uses the same |
| Font | Outfit (already the app font) |

## Status-chip vocabulary (single source: `chipStatus()` → `StatusBadge`)

| Setup status | Badge key | Container / ink | Icon |
|---|---|---|---|
| done | `DONE` | success-container / success | CheckCircle2 |
| todo | `TODO` | secondary-container / secondary-foreground | CircleDashed |
| recommended | `RECOMMENDED` | primary-container / primary | Sparkles |
| in_progress | `IN_PROGRESS` (existing) | primary-container / foreground | Clock3 |
| action_required | `ACTION_REQUIRED` | warning-container / warning-foreground | AlertCircle |
| requested | `REQUESTED` (existing) | secondary-container / muted | CircleDashed |
| plan_locked | `PLAN_LOCKED` | surface-variant / muted | Lock |
| failed | `FAILED` (existing) | error-container / error | XCircle |

---

## Per-screen recreation map

| Screen | What it shows | Recreate as |
|---|---|---|
| **S1** Getting started — owner | Three flows (Self / Organisation / Channels), per-flow `StepProgress` + "n of m", per-step rows with chips + CTAs, the server `reason` line on action_required (compliance rejected), the telephony card embedded with its run timeline, the email request row | `getting-started/page.tsx` rewrite: `SetupFlowSection` + `SetupStepRow` + `SetupChip` over `GET /tenants/:id/setup`; embeds the existing `<TelephonyStatusCard onboarding />` (`id="numbers"`) + new `EmailSetupCard` (`id="email"`); overall strip = `StepProgress` + copy naming the next unlock |
| **S2** Getting started — organiser | Self setup only; org/channels absent (hidden, not locked) | Same page; flows render only when `applicable` in the payload |
| **S3** All set (owner) | Persistent completion state; flows collapsed to done rows | Page-level `EmptyState` + collapsed rows; nav item self-hides via `setupComplete()` |
| **S4** Grassroots | Channel steps plan-locked (greyed rows + Lock chips, no CTAs) + upgrade banner stating shared-channel sending is unaffected | Server sends `planLocked: true` per channel step; `SetupFlowSection` renders the upgrade banner |
| **S5** Tracker pill | Bottom-left pill: SVG progress ring + "Set up · 4/9" + chevron; clear of the 220px sidebar | `SetupTracker` collapsed state; `fixed bottom-4 z-40; left: calc(var(--sidebar-w) + 1rem)` |
| **S6** Tracker expanded | `role="dialog"` popover: header progress + Dismiss, per-flow groups of compact rows with chips, "Open setup page" footer | `SetupTracker` expanded; rows deep-link + collapse; Dismiss stores `{at, blockingDone}` per user (localStorage), resurfaces on regression |
| **S7** Tracker celebration | One-time "You're all set" auto-expand, Done retires the tracker | `SetupTracker` celebration branch; `uprise.setup.celebrated.<tenantId>` |
| **S8** Locked controls | (1) setup-locked button + missing-list popover + Finish-setup link; (2) plan-locked variant with upgrade copy; (3) the 422 SETUP_INCOMPLETE fallback inline in the provision dialog | `LockedAction` wrapping the telephony provision CTA (gate `canProvisionTelephony`); plan variant from `reason: "PLAN_UPGRADE_REQUIRED"`; dialog 422 branch refetches setup state |
| **S9** Email request | Request CTA flips the chip to REQUESTED live; copy sets the expectation (Uprise team fulfils; shared sender keeps working) | `EmailSetupCard`: `LockedAction` (gate `canRequestEmail`) → `emailProvisioning.requestSetup` → invalidate + REQUESTED badge; withdraw available; super-admin queue on the platform email console |

## Interaction notes
- Chips never carry actions; the row CTA does. plan_locked rows have no CTA at all.
- The tracker is non-modal (no focus trap); Esc/outside-click collapse it; the tour (z-9999)
  always renders above it (z-40).
- Locked buttons are `aria-disabled` (not `disabled`) so they stay focusable and can open the
  explanation popover from keyboard; focus returns to the trigger on close.
- Every "locked" surface names the escape hatch: the missing steps + a deep link, or the plan
  upgrade path — and reiterates that shared-channel sending still works.
- Copy tone: direct, second person, no exclamation marks except the completion states.
