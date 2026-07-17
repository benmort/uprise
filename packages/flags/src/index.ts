/**
 * Typed feature-flag catalogue — the single source of truth for uprise flags.
 *
 * A flag's effective value resolves through a precedence chain (highest first):
 *   env override  →  per-tenant override  →  plan entitlement  →  global override  →  default
 *
 * Each flag declares `controllableBy`, so the resolver and admin UI know which
 * layers may set it. Keys are kept as the historical `FEATURE_*` names so the
 * `GET /system/feature-flags` response stays backwards compatible.
 */

import { NAV_FLAGS, type NavFlagKey } from "./nav";

/** What the flag does for the product. */
export type FlagKind = "release" | "ops" | "experiment" | "navigation";

/** A layer that may set a flag, in precedence order (env wins, default is the floor).
 * "network" sits between tenant and plan: a network-wide override applies to any
 * tenant- or plan-controllable flag (it's a coarser tenant override), so it isn't
 * declared per-flag in `controllableBy` — only used as a resolution source. */
export type FlagLayer = "env" | "tenant" | "network" | "plan" | "global";

export interface FlagDef {
  readonly key: string;
  readonly description: string;
  readonly default: boolean;
  readonly kind: FlagKind;
  /** Layers allowed to control this flag. "ops" flags are typically env-only. */
  readonly controllableBy: readonly FlagLayer[];
  /** The process.env var that acts as the ops kill-switch for this flag. */
  readonly envVar: string;
}

// release/entitlement flags still gated by an env kill-switch (legacy default).
const RELEASE: readonly FlagLayer[] = ["env", "tenant", "plan", "global"];
// plan-driven product features: set per plan (cascading network → tenant), with a
// per-workspace override + global platform fallback. No env kill-switch.
const PLAN_DRIVEN: readonly FlagLayer[] = ["tenant", "plan", "global"];
// platform-wide infra/test switches: one global toggle, no env, no per-tenant scope.
const GLOBAL_ONLY: readonly FlagLayer[] = ["global"];

const CORE_FLAGS = [
  {
    key: "FEATURE_REALTIME_ENABLED",
    description: "Realtime inbox/analytics streaming (SSE).",
    default: true,
    kind: "ops",
    controllableBy: GLOBAL_ONLY,
    envVar: "FEATURE_REALTIME_ENABLED",
  },
  {
    key: "FEATURE_AI_ASSIST_ENABLED",
    description: "AI reply suggestions in the inbox.",
    default: true,
    kind: "release",
    controllableBy: PLAN_DRIVEN,
    envVar: "FEATURE_AI_ASSIST_ENABLED",
  },
  {
    key: "FEATURE_BLAST_SCHEDULER_ENABLED",
    description: "Scheduling blasts to send later.",
    default: true,
    kind: "release",
    controllableBy: PLAN_DRIVEN,
    envVar: "FEATURE_BLAST_SCHEDULER_ENABLED",
  },
  {
    key: "FEATURE_SEGMENTS_ENABLED",
    description:
      "The segment builder (engine v2): audience definitions with the filter tree, policy layer, live preview, AI authoring and blast targeting.",
    default: false,
    kind: "release",
    controllableBy: RELEASE,
    envVar: "FEATURE_SEGMENTS_ENABLED",
  },
  {
    key: "FEATURE_JOURNEYS_ENABLED",
    description: "Automated supporter journeys.",
    default: false,
    kind: "release",
    controllableBy: RELEASE,
    envVar: "FEATURE_JOURNEYS_ENABLED",
  },
  {
    key: "FEATURE_WHATSAPP_ENABLED",
    description: "WhatsApp as a messaging channel (also requires Twilio WhatsApp config).",
    default: false,
    kind: "release",
    controllableBy: PLAN_DRIVEN,
    envVar: "FEATURE_WHATSAPP_ENABLED",
  },
  {
    key: "FEATURE_TENANT_EMAIL_ENABLED",
    description:
      "Per-tenant email sender identities: SendGrid subusers, authenticated uprise subdomains / tenant domains and tenant-scoped from-addresses. Off ⇒ every send uses the platform SENDGRID_* env sender.",
    default: false,
    kind: "release",
    controllableBy: PLAN_DRIVEN,
    envVar: "FEATURE_TENANT_EMAIL_ENABLED",
  },
  {
    key: "FEATURE_TENANT_TELEPHONY_ENABLED",
    description:
      "Per-tenant Twilio numbers: subaccount provisioning, AU regulatory compliance and tenant-scoped senders. Off ⇒ every send uses the platform TWILIO_* env credentials.",
    default: false,
    kind: "release",
    controllableBy: PLAN_DRIVEN,
    envVar: "FEATURE_TENANT_TELEPHONY_ENABLED",
  },
  {
    key: "FEATURE_MULTIBRAND_ENABLED",
    description:
      "Multi-tenant & multi-brand: per-tenant branding / white-label portals & sub-tenants.",
    default: false,
    kind: "release",
    controllableBy: PLAN_DRIVEN,
    envVar: "FEATURE_MULTIBRAND_ENABLED",
  },
  {
    key: "FEATURE_BULLMQ_UPLOAD_ENABLED",
    description: "Route audience CSV imports through the BullMQ worker (vs inline).",
    default: false,
    kind: "ops",
    controllableBy: GLOBAL_ONLY,
    envVar: "FEATURE_BULLMQ_UPLOAD_ENABLED",
  },
  {
    key: "FEATURE_BULLMQ_BLAST_ENABLED",
    description: "Route blast sends through the BullMQ worker (vs inline).",
    default: false,
    kind: "ops",
    controllableBy: GLOBAL_ONLY,
    envVar: "FEATURE_BULLMQ_BLAST_ENABLED",
  },
  {
    key: "BLAST_DRY_RUN",
    description: "Simulate blast sends without dispatching to the carrier.",
    default: false,
    kind: "ops",
    controllableBy: GLOBAL_ONLY,
    envVar: "BLAST_DRY_RUN",
  },
] as const satisfies readonly FlagDef[];

// Navigation flags (one per gateable admin menu item, 1st + 2nd level) are generated
// from the NAV_FLAGS registry: plan-driven, default ON, so plans/overrides RESTRICT.
const NAV_FLAG_DEFS: readonly FlagDef[] = NAV_FLAGS.map((n) => ({
  key: n.key,
  description: `Show the "${n.label}" menu item${n.level === 2 ? " (sub-item)" : ""}.`,
  default: true,
  kind: "navigation" as const,
  controllableBy: PLAN_DRIVEN,
  envVar: n.key,
}));

/** The full catalogue: core product/ops flags + the generated navigation flags. */
export const FLAGS: readonly FlagDef[] = [...CORE_FLAGS, ...NAV_FLAG_DEFS];

export { NAV_FLAGS };
export type { NavFlag, NavFlagKey } from "./nav";

/** Union of every catalogue flag key (core literals + navigation flag keys). */
export type FeatureFlagKey = (typeof CORE_FLAGS)[number]["key"] | NavFlagKey;

/** The effective on/off map returned to clients, keyed by flag. */
export type FeatureFlagMap = Record<FeatureFlagKey, boolean>;

export const FEATURE_FLAG_KEYS: readonly FeatureFlagKey[] = FLAGS.map(
  (f) => f.key,
) as readonly FeatureFlagKey[];

export const FLAG_META: Record<FeatureFlagKey, FlagDef> = Object.fromEntries(
  FLAGS.map((f) => [f.key, f]),
) as Record<FeatureFlagKey, FlagDef>;

export const FLAG_DEFAULTS: FeatureFlagMap = Object.fromEntries(
  FLAGS.map((f) => [f.key, f.default]),
) as FeatureFlagMap;

export function isFeatureFlagKey(key: string): key is FeatureFlagKey {
  return key in FLAG_META;
}

export function flagControllableBy(key: FeatureFlagKey, layer: FlagLayer): boolean {
  return FLAG_META[key].controllableBy.includes(layer);
}
