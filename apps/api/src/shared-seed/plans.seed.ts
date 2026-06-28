import type { PrismaService } from "../prisma/prisma.service";

/**
 * Canonical subscription plans. `key` matches Network.planName + the Stripe price nickname.
 * Grassroots is the hidden free tier (super-admin assignable, off the public pricing page).
 * `featureFlags` only needs to RESTRICT (nav flags default ON) — so we just turn WhatsApp off
 * for Grassroots. `limits` (null member = unlimited) drives enforcement; `features` is the
 * public pricing-table column (display only).
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
): FeatureRow[] => [
  { label: "Email campaigns", value: email },
  { label: "SMS campaigns", value: sms },
  { label: "Calling campaigns", value: calling },
  { label: "Forms & petitions", value: forms },
  { label: "Surveys & fundraisers", value: surveys },
  { label: "Basic reporting", value: true },
  { label: "Advanced analytics", value: analytics },
  { label: "API access & priority support", value: api },
];

export const PLAN_SEED: PlanSeed[] = [
  {
    key: "grassroots",
    displayName: "Grassroots",
    publiclyVisible: false,
    isDefault: false,
    order: 0,
    popular: false,
    description: "Free tier for grassroots organisers",
    priceMonthly: 0,
    priceMonthlyOriginal: null,
    priceAnnually: 0,
    priceAnnuallyOriginal: null,
    featureFlags: { FEATURE_WHATSAPP_ENABLED: false },
    limits: { contacts: 1000, teamMembers: 2, segments: 2 },
    features: featureRows(true, false, false, true, false, false, false),
  },
  {
    key: "starter",
    displayName: "Starter",
    publiclyVisible: true,
    isDefault: false,
    order: 1,
    popular: false,
    description: "For small teams and local campaigns",
    priceMonthly: 49,
    priceMonthlyOriginal: 59,
    priceAnnually: 499,
    priceAnnuallyOriginal: 708,
    featureFlags: { FEATURE_WHATSAPP_ENABLED: true },
    limits: { contacts: 5000, teamMembers: 3, segments: 5 },
    features: featureRows(true, false, false, true, false, false, false),
  },
  {
    key: "growth",
    displayName: "Growth",
    publiclyVisible: true,
    isDefault: false,
    order: 2,
    popular: true,
    description: "For growing organisations and regional campaigns",
    priceMonthly: 149,
    priceMonthlyOriginal: 179,
    priceAnnually: 1599,
    priceAnnuallyOriginal: 2148,
    featureFlags: { FEATURE_WHATSAPP_ENABLED: true },
    limits: { contacts: 25000, teamMembers: 10, segments: 20 },
    features: featureRows(true, true, false, true, true, true, false),
  },
  {
    key: "scale",
    displayName: "Scale",
    publiclyVisible: true,
    isDefault: false,
    order: 3,
    popular: false,
    description: "For larger teams and multi-region operations",
    priceMonthly: 298,
    priceMonthlyOriginal: 358,
    priceAnnually: 3199,
    priceAnnuallyOriginal: 4296,
    featureFlags: { FEATURE_WHATSAPP_ENABLED: true },
    limits: { contacts: 100000, teamMembers: 25, segments: null },
    features: featureRows(true, true, true, true, true, true, true),
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
