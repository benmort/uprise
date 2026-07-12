import { PrismaClient } from "@uprise/db";
import { hashPassword } from "../auth/password.util";
import { KEEP_TENANTS, SUPERADMIN_EMAIL, type SeedTenant } from "../shared-seed/tenants.seed";

/**
 * DESTRUCTIVE, IRREVERSIBLE reset. Reduces the database to the KEEP_TENANTS set
 * (all owned by the SUPERADMIN_EMAIL account) and removes everything else.
 *
 * Nest-free (bare PrismaClient, like seed-plans-standalone.ts) so it carries no
 * Redis/queue boot. Everything runs in a single transaction — all-or-nothing.
 *
 * Safety:
 *   - Dry-run by DEFAULT. It only writes when passed `--apply`.
 *   - `--apply` additionally requires SUPERADMIN_PASSWORD (the password to set on
 *     the super-admin). Nothing else is read from the environment except
 *     DATABASE_URL (the target DB — point it at prod deliberately).
 *
 *   SUPERADMIN_PASSWORD='…' pnpm --filter api reset:tenants           # dry-run report
 *   SUPERADMIN_PASSWORD='…' pnpm --filter api reset:tenants -- --apply # execute
 *
 * What survives:
 *   - The 5 KEEP_TENANTS and their entire cascaded tenant-scoped graph.
 *   - The super-admin user (+ its profile/avatar), made OWNER of all 5 tenants.
 *   - Global reference data: payment.Plan and the geo.* schema (untouched).
 * What is removed:
 *   - Every other tenant (cascade wipes its contacts/audiences/blasts/canvass/…).
 *   - Every other user (cascade wipes their sessions/memberships/turf assignments).
 *   - id-only tenant-scoped rows (email/payment/telephony/org-profile/…) for
 *     non-kept tenants — these have no FK to Tenant so they can't cascade.
 *   - Ephemeral auth tokens + operational logs (magic links, resets, sessions,
 *     outbox, reaction dedup, webhook events).
 */

const APPLY = process.argv.includes("--apply");

type TenantRow = { id: string; slug: string; name: string };

/** Choose which existing tenants survive. For each desired tenant, the oldest row
 *  matching by slug OR (case-insensitive) name is the survivor; any further
 *  matches fall into the delete set (dedupe). The survivor→desired mapping is
 *  decided ONCE here so the apply phase never re-derives (and never mis-assigns)
 *  it. `existing` must be createdAt-asc. */
function resolveKeepPlan(existing: TenantRow[]): {
  keep: Array<{ id: string; desired: SeedTenant }>; // existing rows we keep, and what they become
  deleteIds: string[]; // ids of existing rows we delete
  missing: SeedTenant[]; // desired tenants with no existing match — created on apply
} {
  const keep: Array<{ id: string; desired: SeedTenant }> = [];
  const claimed = new Set<string>();
  const missing: SeedTenant[] = [];
  for (const desired of KEEP_TENANTS) {
    const match = existing.find(
      (t) =>
        !claimed.has(t.id) &&
        (t.slug === desired.slug || t.name.trim().toLowerCase() === desired.name.toLowerCase()),
    );
    if (match) {
      claimed.add(match.id);
      keep.push({ id: match.id, desired });
    } else {
      missing.push(desired);
    }
  }
  const deleteIds = existing.filter((t) => !claimed.has(t.id)).map((t) => t.id);
  return { keep, deleteIds, missing };
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const password = process.env.SUPERADMIN_PASSWORD ?? "";
  if (APPLY && !password) {
    // eslint-disable-next-line no-console
    console.error("SUPERADMIN_PASSWORD is required with --apply (the password to set on the super-admin).");
    process.exit(1);
  }

  try {
    const existing = await prisma.tenant.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, slug: true, name: true },
    });
    const plan = resolveKeepPlan(existing);
    // Existing survivor ids are enough to scope the dry-run counts — tenants that
    // don't exist yet own no rows.
    const keepIdsForCount = plan.keep.map((k) => k.id);

    // ── Report ────────────────────────────────────────────────────────────────
    // Prisma `notIn: []` matches every row — exactly right when no survivor exists
    // yet (everything is non-kept). So this scopes correctly for a fresh DB too.
    const nonKept = { tenantId: { notIn: keepIdsForCount } };
    const [totalTenants, totalUsers, delContacts, delEmails, delPayments, delCalls, delOrgProfiles] =
      await Promise.all([
        prisma.tenant.count(),
        prisma.user.count(),
        prisma.contact.count({ where: nonKept }),
        prisma.email.count({ where: nonKept }),
        prisma.payment.count({ where: nonKept }),
        prisma.call.count({ where: nonKept }),
        prisma.orgProfile.count({ where: nonKept }),
      ]);
    const usersToDelete = await prisma.user.count({ where: { email: { not: SUPERADMIN_EMAIL } } });

    // eslint-disable-next-line no-console
    console.log(
      [
        "",
        `Mode:            ${APPLY ? "APPLY (writing)" : "DRY-RUN (no writes — pass --apply to execute)"}`,
        `Super-admin:     ${SUPERADMIN_EMAIL}`,
        `Keep tenants:    ${KEEP_TENANTS.map((t) => t.slug).join(", ")}`,
        "",
        `Tenants:         ${totalTenants} total → keep ${plan.keep.length} existing + create ${plan.missing.length} → delete ${plan.deleteIds.length}`,
        `Users:           ${totalUsers} total → keep 1 (super-admin) → delete ${usersToDelete}`,
        `Contacts:        delete ~${delContacts} (cascade)`,
        `Emails:          delete ~${delEmails} (id-only)`,
        `Payments:        delete ~${delPayments} (id-only)`,
        `Calls:           delete ~${delCalls} (id-only)`,
        `Org profiles:    delete ~${delOrgProfiles} (id-only)`,
        `Also wiped:      magic links, password resets, mobile verifications, sessions, outbox, reaction dedup, webhook events.`,
        `Preserved:       payment.Plan (all), geo.* (all).`,
        "",
      ].join("\n"),
    );

    if (!APPLY) {
      // eslint-disable-next-line no-console
      console.log("Dry-run only. Re-run with `-- --apply` (and SUPERADMIN_PASSWORD) to execute.");
      return;
    }

    const passwordHash = await hashPassword(password);

    await prisma.$transaction(
      async (tx) => {
        // 0. Ensure the super-admin exists first (so it is never in the delete set).
        const superAdmin = await tx.user.upsert({
          where: { email: SUPERADMIN_EMAIL },
          update: { passwordHash, isSuperAdmin: true, emailVerified: true, deletedAt: null },
          create: {
            email: SUPERADMIN_EMAIL,
            displayName: "Uprise Labs",
            passwordHash,
            isSuperAdmin: true,
            emailVerified: true,
          },
        });

        // A. Delete non-kept tenants FIRST — cascade wipes their scoped graph and
        //    frees any slug/name a survivor needs to normalise to.
        if (plan.deleteIds.length) {
          await tx.tenant.deleteMany({ where: { id: { in: plan.deleteIds } } });
        }

        // B. Normalise surviving tenants to their canonical slug/name; create any
        //    missing. Park survivors on unique temp slugs first so the final
        //    assignment can never collide on the unique slug (e.g. a swap among
        //    the kept set). Non-kept slug holders are already gone (step A).
        const keepIds: string[] = [];
        for (const { id } of plan.keep) {
          await tx.tenant.update({ where: { id }, data: { slug: `reset-tmp-${id}` } });
        }
        for (const { id, desired } of plan.keep) {
          // deletedAt: null revives a kept tenant that was soft-deleted — otherwise it
          // survives the reset but stays hidden from the workspace switcher.
          await tx.tenant.update({ where: { id }, data: { slug: desired.slug, name: desired.name, deletedAt: null } });
          keepIds.push(id);
        }
        for (const desired of plan.missing) {
          const created = await tx.tenant.create({ data: { slug: desired.slug, name: desired.name } });
          keepIds.push(created.id);
        }

        // C. Make the super-admin OWNER of every kept tenant.
        for (const tenantId of keepIds) {
          await tx.tenantMember.upsert({
            where: { tenantId_userId: { tenantId, userId: superAdmin.id } },
            update: { role: "OWNER" },
            create: { tenantId, userId: superAdmin.id, role: "OWNER" },
          });
        }

        // D. id-only tenant-scoped rows (no FK to Tenant → won't cascade).
        const notInKeep = { notIn: keepIds };
        await tx.email.deleteMany({ where: { tenantId: notInKeep } });
        await tx.emailTemplate.deleteMany({ where: { tenantId: notInKeep } });
        await tx.emailAccount.deleteMany({ where: { tenantId: notInKeep } });
        await tx.emailSenderIdentity.deleteMany({ where: { tenantId: notInKeep } });
        await tx.emailProvisioningRun.deleteMany({ where: { tenantId: notInKeep } }); // steps cascade
        await tx.telephonyProvisioningRun.deleteMany({ where: { tenantId: notInKeep } }); // steps cascade
        await tx.telephonyPhoneNumber.deleteMany({ where: { tenantId: notInKeep } });
        await tx.telephonyAccount.deleteMany({ where: { tenantId: notInKeep } });
        await tx.call.deleteMany({ where: { tenantId: notInKeep } });
        await tx.payment.deleteMany({ where: { tenantId: notInKeep } }); // refunds cascade
        await tx.subscription.deleteMany({ where: { tenantId: notInKeep } });
        await tx.invoice.deleteMany({ where: { tenantId: notInKeep } });
        // Customer.tenantId is nullable — drop null-tenant (network-level) rows too.
        await tx.customer.deleteMany({ where: { OR: [{ tenantId: null }, { tenantId: notInKeep }] } });
        await tx.orgProfile.deleteMany({ where: { tenantId: notInKeep } }); // contacts/addresses/credential cascade
        await tx.messageTemplate.deleteMany({ where: { tenantId: notInKeep } });
        await tx.qaFlagResolution.deleteMany({ where: { tenantId: notInKeep } });
        await tx.contactSourceRecord.deleteMany({ where: { tenantId: notInKeep } });

        // E. Delete every other user (cascades sessions/memberships/turf assignments;
        //    SET NULL on audience/blast/doorknock authorship).
        await tx.user.deleteMany({ where: { id: { not: superAdmin.id } } });

        // F. Orphan cleanup for id-only user/customer refs.
        await tx.userProfile.deleteMany({ where: { userId: { not: superAdmin.id } } });
        await tx.userAvatar.deleteMany({ where: { userId: { not: superAdmin.id } } });
        const keptCustomers = await tx.customer.findMany({ select: { id: true } });
        const keptCustomerIds = keptCustomers.map((c) => c.id);
        await tx.paymentMethod.deleteMany({
          where: keptCustomerIds.length ? { customerId: { notIn: keptCustomerIds } } : {},
        });
        // Networks not referenced by a kept tenant (Tenant.networkId → SET NULL, so
        // never delete one a kept tenant still points at).
        const keptTenants = await tx.tenant.findMany({
          where: { id: { in: keepIds } },
          select: { networkId: true },
        });
        const keptNetworkIds = [...new Set(keptTenants.map((t) => t.networkId).filter((n): n is string => !!n))];
        await tx.network.deleteMany({
          where: keptNetworkIds.length ? { id: { notIn: keptNetworkIds } } : {},
        });

        // G. Ephemeral auth tokens + operational logs — reset wholesale.
        await tx.magicLink.deleteMany({});
        await tx.passwordReset.deleteMany({});
        await tx.mobileVerification.deleteMany({});
        await tx.session.deleteMany({});
        await tx.outboxEvent.deleteMany({});
        await tx.reactionDedup.deleteMany({});
        await tx.webhookEvent.deleteMany({});
      },
      { maxWait: 15_000, timeout: 180_000 },
    );

    const [tenantsAfter, usersAfter] = await Promise.all([prisma.tenant.count(), prisma.user.count()]);
    // eslint-disable-next-line no-console
    console.log(`\nDone. Tenants: ${tenantsAfter}, Users: ${usersAfter}. Super-admin owns all kept tenants.`);
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error("reset-to-tenants failed:", error);
    process.exit(1);
  });
