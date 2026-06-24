/**
 * Typed feature-flag catalogue — the single source of truth for yarns flags.
 *
 * A flag's effective value resolves through a precedence chain (highest first):
 *   env override  →  per-tenant override  →  plan entitlement  →  global override  →  default
 *
 * Each flag declares `controllableBy`, so the resolver and admin UI know which
 * layers may set it. Keys are kept as the historical `FEATURE_*` names so the
 * `GET /system/feature-flags` response stays backwards compatible.
 */

/** What the flag does for the product. */
export type FlagKind = "release" | "ops" | "experiment";

/** A layer that may set a flag, in precedence order (env wins, default is the floor). */
export type FlagLayer = "env" | "tenant" | "plan" | "global";

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

// release/entitlement flags: gateable by plan + per-tenant + global + env.
const RELEASE: readonly FlagLayer[] = ["env", "tenant", "plan", "global"];
// ops flags: infra/operational switches, env-only (not tenant/plan controllable).
const OPS_ENV_ONLY: readonly FlagLayer[] = ["env"];
// ops flags an admin may also flip platform-wide via the global layer.
const OPS_GLOBAL: readonly FlagLayer[] = ["env", "global"];

export const FLAGS = [
  {
    key: "FEATURE_REALTIME_ENABLED",
    description: "Realtime inbox/analytics streaming (SSE).",
    default: true,
    kind: "ops",
    controllableBy: OPS_GLOBAL,
    envVar: "FEATURE_REALTIME_ENABLED",
  },
  {
    key: "FEATURE_AI_ASSIST_ENABLED",
    description: "AI reply suggestions in the inbox.",
    default: true,
    kind: "release",
    controllableBy: RELEASE,
    envVar: "FEATURE_AI_ASSIST_ENABLED",
  },
  {
    key: "FEATURE_BLAST_SCHEDULER_ENABLED",
    description: "Scheduling blasts to send later.",
    default: true,
    kind: "release",
    controllableBy: RELEASE,
    envVar: "FEATURE_BLAST_SCHEDULER_ENABLED",
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
    controllableBy: RELEASE,
    envVar: "FEATURE_WHATSAPP_ENABLED",
  },
  {
    key: "FEATURE_BULLMQ_UPLOAD_ENABLED",
    description: "Route audience CSV imports through the BullMQ worker (vs inline).",
    default: false,
    kind: "ops",
    controllableBy: OPS_ENV_ONLY,
    envVar: "FEATURE_BULLMQ_UPLOAD_ENABLED",
  },
  {
    key: "FEATURE_BULLMQ_BLAST_ENABLED",
    description: "Route blast sends through the BullMQ worker (vs inline).",
    default: false,
    kind: "ops",
    controllableBy: OPS_ENV_ONLY,
    envVar: "FEATURE_BULLMQ_BLAST_ENABLED",
  },
  {
    key: "BLAST_DRY_RUN",
    description: "Simulate blast sends without dispatching to the carrier.",
    default: false,
    kind: "ops",
    controllableBy: OPS_GLOBAL,
    envVar: "BLAST_DRY_RUN",
  },
] as const satisfies readonly FlagDef[];

/** Union of every catalogue flag key. */
export type FeatureFlagKey = (typeof FLAGS)[number]["key"];

/** The effective on/off map returned to clients, keyed by flag. */
export type FeatureFlagMap = Record<FeatureFlagKey, boolean>;

export const FEATURE_FLAG_KEYS: readonly FeatureFlagKey[] = FLAGS.map((f) => f.key);

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
