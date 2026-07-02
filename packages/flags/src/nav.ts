/**
 * Navigation feature flags — one per gateable admin menu item (first AND second
 * level). Each becomes a plan-driven flag in the catalogue (see ./index.ts), so a
 * tenant's plan (and per-tenant/network overrides) decides which menu items it sees.
 *
 * `section` groups the flags in the Plans + Feature Flags editors (mirrors the nav).
 * Default is ON (non-breaking: existing tenants keep their full nav; plans/overrides
 * RESTRICT). Journeys + WhatsApp are NOT here — they reuse the pre-existing
 * FEATURE_JOURNEYS_ENABLED / FEATURE_WHATSAPP_ENABLED flags.
 *
 * Dashboard + Settings are intentionally absent (always available) and Super Admin
 * is gated by the User.isSuperAdmin flag, not a feature flag.
 */
export const NAV_FLAGS = [
  // ── First level ──────────────────────────────────────────────────────
  { key: "FEATURE_NAV_INBOX", label: "Inbox", section: "Inbox", level: 1 },
  { key: "FEATURE_NAV_CHANNELS", label: "Channels", section: "Channels", level: 1 },
  { key: "FEATURE_NAV_CANVASS", label: "Canvass", section: "Canvass", level: 1 },
  { key: "FEATURE_NAV_ENGAGEMENT", label: "Engagement", section: "Engagement", level: 1 },
  { key: "FEATURE_NAV_COMPLIANCE", label: "Compliance", section: "Compliance", level: 1 },
  { key: "FEATURE_NAV_PROG", label: "Prog", section: "Prog", level: 1 },

  // ── Second level: Channels (WhatsApp reuses FEATURE_WHATSAPP_ENABLED) ──
  { key: "FEATURE_NAV_CHANNELS_TEXT", label: "Text", section: "Channels", level: 2 },

  // ── Second level: Canvass (Overview = group root, gated by the group) ──
  { key: "FEATURE_NAV_CANVASS_CAMPAIGNS", label: "Campaigns", section: "Canvass", level: 2 },
  { key: "FEATURE_NAV_CANVASS_TURF", label: "Turf map", section: "Canvass", level: 2 },
  { key: "FEATURE_NAV_CANVASS_WALKLISTS", label: "Walk lists", section: "Canvass", level: 2 },
  { key: "FEATURE_NAV_CANVASS_LIVE", label: "Live", section: "Canvass", level: 2 },
  { key: "FEATURE_NAV_CANVASS_VOLUNTEERS", label: "Volunteers", section: "Canvass", level: 2 },
  { key: "FEATURE_NAV_CANVASS_DIVISIONS", label: "Divisions", section: "Canvass", level: 2 },
  { key: "FEATURE_NAV_CANVASS_AREAS", label: "Areas", section: "Canvass", level: 2 },
  { key: "FEATURE_NAV_CANVASS_RESULTS", label: "Results", section: "Canvass", level: 2 },

  // ── Second level: Engagement ──────────────────────────────────────────
  { key: "FEATURE_NAV_ENGAGEMENT_AUDIENCE", label: "Audience", section: "Engagement", level: 2 },
  { key: "FEATURE_NAV_ENGAGEMENT_SURVEYS", label: "Surveys", section: "Engagement", level: 2 },
  { key: "FEATURE_NAV_ENGAGEMENT_SCRIPTS", label: "Scripts", section: "Engagement", level: 2 },
  { key: "FEATURE_NAV_ENGAGEMENT_DISPOSITIONS", label: "Dispositions", section: "Engagement", level: 2 },
  { key: "FEATURE_NAV_ENGAGEMENT_CANNED", label: "Canned responses", section: "Engagement", level: 2 },

  // ── Second level: Prog ────────────────────────────────────────────────
  { key: "FEATURE_NAV_PROG_CALENDAR", label: "Calendar", section: "Prog", level: 2 },
  { key: "FEATURE_NAV_PROG_CHANNELS", label: "Prog · Channels", section: "Prog", level: 2 },
  { key: "FEATURE_NAV_PROG_ORGANISING", label: "Organising", section: "Prog", level: 2 },
  { key: "FEATURE_NAV_PROG_TASKS", label: "Tasks", section: "Prog", level: 2 },
  { key: "FEATURE_NAV_PROG_BUSINESS", label: "Business", section: "Prog", level: 2 },
  { key: "FEATURE_NAV_PROG_WORKSPACE", label: "Workspace", section: "Prog", level: 2 },
  { key: "FEATURE_NAV_PROG_DATA", label: "Data & Files", section: "Prog", level: 2 },
  { key: "FEATURE_NAV_PROG_DEVHUB", label: "Developer Hub", section: "Prog", level: 2 },
] as const;

export type NavFlag = (typeof NAV_FLAGS)[number];
export type NavFlagKey = NavFlag["key"];
