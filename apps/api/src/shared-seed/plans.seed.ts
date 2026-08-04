import type { PrismaService } from "../prisma/prisma.service";

/**
 * Canonical subscription plans. `key` matches Network.planName + the Stripe price nickname.
 *
 * Public pricing shows the two quoted tiers only — Grassroots (philanthropic licence, apply
 * with us) and Scale (sized per organisation, talk to us). Starter and Growth are
 * `publiclyVisible: false`: hidden from the pricing page but fully intact, so networks already
 * on them keep their entitlements and limits.
 *
 * Growth carries `isDefault: true` and is therefore the baseline for any tenant whose network
 * has no plan — both its `featureFlags` and its `limits`. Exactly one plan may be default.
 *
 * `featureFlags` carries each plan's entitlements: nav flags default ON so we RESTRICT (e.g.
 * WhatsApp off for Grassroots), while default-OFF entitlements are GRANTED (e.g. multi-brand on
 * Scale only). `limits` (null member = unlimited) drives enforcement; `features` is the public
 * pricing-table column (display only).
 */
type FeatureRow = { label: string; value: boolean | string };

export interface PlanSeed {
  key: string;
  displayName: string;
  publiclyVisible: boolean;
  isDefault: boolean;
  order: number;
  popular: boolean;
  description: string;
  priceMonthly: number | null;
  priceMonthlyOriginal: number | null;
  priceAnnually: number | null;
  priceAnnuallyOriginal: number | null;
  featureFlags: Record<string, boolean>;
  limits: { contacts: number | null; teamMembers: number | null; segments: number | null };
  features: FeatureRow[];
}

const featureRows = (
  email: boolean,
  sms: boolean,
  calling: boolean,
  forms: boolean,
  surveys: boolean,
  analytics: boolean,
  api: boolean,
  multibrand: boolean,
): FeatureRow[] => [
  { label: "Email campaigns", value: email },
  { label: "SMS campaigns", value: sms },
  { label: "Calling campaigns", value: calling },
  { label: "Forms & petitions", value: forms },
  { label: "Surveys & fundraisers", value: surveys },
  { label: "Basic reporting", value: true },
  { label: "Advanced analytics", value: analytics },
  { label: "API access & priority support", value: api },
  { label: "Multi-tenant & multi-brand", value: multibrand },
];

export const PLAN_SEED: PlanSeed[] = [
  {
    key: "grassroots",
    displayName: "Grassroots",
    publiclyVisible: true,
    isDefault: false,
    order: 0,
    popular: false,
    description:
      "Philanthropically funded licences for grassroots organisations doing work that deserves better tools than they can afford. Tell us about your campaign and we'll take it from there.",
    // Quoted, not listed. A philanthropic licence is assessed, not bought, so all four price
    // fields stay null and the pricing page renders the apply-with-us treatment rather than $0
    // — which would otherwise read as self-serve and route to sign-up.
    priceMonthly: null,
    priceMonthlyOriginal: null,
    priceAnnually: null,
    priceAnnuallyOriginal: null,
    featureFlags: {
      FEATURE_WHATSAPP_ENABLED: false,
      FEATURE_MULTIBRAND_ENABLED: false,
      // Own-channel provisioning (dedicated numbers / email identities) is paid-plan only.
      FEATURE_TENANT_TELEPHONY_ENABLED: false,
      // Calling campaigns ride tenant telephony, so they gate together.
      FEATURE_AUTODIALER_ENABLED: false,
      FEATURE_ACTIONS_CALLS: false,
      FEATURE_TENANT_EMAIL_ENABLED: false,
      FEATURE_OWN_CHANNELS_SETUP: false,
    },
    limits: { contacts: 1000, teamMembers: 2, segments: 2 },
    features: featureRows(true, false, false, true, false, false, false, false),
  },
  {
    key: "starter",
    displayName: "Starter",
    // Hidden, not removed: existing networks stay on this plan and keep their entitlements;
    // it is simply off the public pricing page.
    publiclyVisible: false,
    isDefault: false,
    order: 1,
    popular: false,
    description: "For small teams and local campaigns",
    priceMonthly: 149,
    priceMonthlyOriginal: 179,
    priceAnnually: 1599,
    priceAnnuallyOriginal: 2148,
    featureFlags: {
      FEATURE_WHATSAPP_ENABLED: true,
      FEATURE_MULTIBRAND_ENABLED: false,
      FEATURE_TENANT_TELEPHONY_ENABLED: true,
      FEATURE_AUTODIALER_ENABLED: true,
      FEATURE_ACTIONS_CALLS: true,
      FEATURE_TENANT_EMAIL_ENABLED: true,
      FEATURE_OWN_CHANNELS_SETUP: false,
    },
    limits: { contacts: 5000, teamMembers: 3, segments: 5 },
    features: featureRows(true, false, false, true, false, false, false, false),
  },
  {
    key: "growth",
    displayName: "Growth",
    // Hidden from pricing but load-bearing: isDefault makes it the entitlement + limit baseline
    // for any tenant whose network has no plan (see FeatureFlagsService.loadPlanEntitlements and
    // PlanLimitsService.resolveForTenant). Exactly one plan may be the default.
    publiclyVisible: false,
    isDefault: true,
    order: 2,
    popular: false,
    description: "For growing organisations and regional campaigns",
    priceMonthly: 298,
    priceMonthlyOriginal: 358,
    priceAnnually: 3199,
    priceAnnuallyOriginal: 4296,
    featureFlags: {
      FEATURE_WHATSAPP_ENABLED: true,
      FEATURE_MULTIBRAND_ENABLED: false,
      FEATURE_TENANT_TELEPHONY_ENABLED: true,
      FEATURE_AUTODIALER_ENABLED: true,
      FEATURE_ACTIONS_CALLS: true,
      FEATURE_TENANT_EMAIL_ENABLED: true,
      FEATURE_OWN_CHANNELS_SETUP: true,
    },
    limits: { contacts: 25000, teamMembers: 10, segments: 20 },
    features: featureRows(true, true, false, true, true, true, false, false),
  },
  {
    key: "scale",
    displayName: "Scale",
    publiclyVisible: true,
    isDefault: false,
    order: 3,
    popular: false,
    description: "For larger teams and multi-region operations",
    // Quoted, not listed: Scale is sized per organisation, so all four price fields stay null and
    // the pricing page renders "Custom" + a talk-to-us CTA instead of a number.
    priceMonthly: null,
    priceMonthlyOriginal: null,
    priceAnnually: null,
    priceAnnuallyOriginal: null,
    featureFlags: {
      FEATURE_WHATSAPP_ENABLED: true,
      FEATURE_MULTIBRAND_ENABLED: true,
      FEATURE_TENANT_TELEPHONY_ENABLED: true,
      FEATURE_AUTODIALER_ENABLED: true,
      FEATURE_ACTIONS_CALLS: true,
      FEATURE_TENANT_EMAIL_ENABLED: true,
      FEATURE_OWN_CHANNELS_SETUP: true,
    },
    limits: { contacts: 100000, teamMembers: 25, segments: null },
    features: featureRows(true, true, true, true, true, true, true, true),
  },
];

/**
 * Create canonical plans that don't yet exist. Non-clobbering (idempotent): an existing plan
 * is left untouched so admin edits survive a re-run. Returns the keys it created.
 */
export async function seedPlans(prisma: PrismaService): Promise<string[]> {
  const created: string[] = [];
  for (const p of PLAN_SEED) {
    const existing = await prisma.plan.findUnique({ where: { key: p.key } });
    if (existing) continue;
    await prisma.plan.create({ data: p });
    created.push(p.key);
  }
  return created;
}
