import { Prisma } from "@uprise/db";
import { evaluateOrgSetup, type OrgSetupResult, type OrgSetupSnapshot } from "@uprise/contracts";
import { PrismaService } from "../prisma/prisma.service";

/**
 * The one OrgProfile projection `evaluateOrgSetup` consumes.
 *
 * Three callers gate on org-identification completeness — the setup endpoint
 * (`TenantSetupService`), the telephony provisioning gate, and the email provisioning
 * gate — and they must agree exactly: a field selected by one and not another is a
 * surface that says "ready" while the next says "incomplete". Free functions rather
 * than a provider so no module has to import another's just to ask the question.
 */
export const ORG_SETUP_SELECT = {
  name: true,
  bio: true,
  logoBlockUrl: true,
  logoLandscapeUrl: true,
  primaryColour: true,
  secondaryColour: true,
  heroImageUrl: true,
  credential: {
    select: {
      legalTradingName: true,
      australianBusinessNumber: true,
      australianCompanyNumber: true,
      entityType: true,
    },
  },
  contacts: {
    select: {
      firstName: true,
      lastName: true,
      email: true,
      isPrimaryContact: true,
      isAuthorisedSignatory: true,
    },
  },
  addresses: {
    select: { line1: true, suburb: true, city: true, state: true, postcode: true },
  },
} satisfies Prisma.OrgProfileSelect;

export type OrgSetupProfileRow = Prisma.OrgProfileGetPayload<{ select: typeof ORG_SETUP_SELECT }>;

/** Shape a loaded row (or its absence) into the snapshot `evaluateOrgSetup` takes. */
export function toOrgSetupSnapshot(profile: OrgSetupProfileRow | null): OrgSetupSnapshot {
  return {
    profile: profile
      ? {
          name: profile.name,
          bio: profile.bio,
          logoBlockUrl: profile.logoBlockUrl,
          logoLandscapeUrl: profile.logoLandscapeUrl,
          primaryColour: profile.primaryColour,
          secondaryColour: profile.secondaryColour,
          heroImageUrl: profile.heroImageUrl,
        }
      : null,
    credential: profile?.credential ?? null,
    contacts: profile?.contacts ?? [],
    addresses: profile?.addresses ?? [],
  };
}

/**
 * Load + evaluate in one call, for the gates that have no other reason to hold the row.
 * `findFirst`, never `ensureProfile` — asking whether setup is complete must not itself
 * create the profile row that makes it look started.
 */
export async function loadOrgSetup(prisma: PrismaService, tenantId: string): Promise<OrgSetupResult> {
  const profile = await prisma.orgProfile.findFirst({ where: { tenantId }, select: ORG_SETUP_SELECT });
  return evaluateOrgSetup(toOrgSetupSnapshot(profile));
}
