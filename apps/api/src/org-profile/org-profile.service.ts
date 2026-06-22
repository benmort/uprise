import { Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OrgCredential, Prisma } from "@yarns/db";
import { PrismaService } from "../prisma/prisma.service";
import { OutboxService } from "../common/outbox/outbox.service";
import { CredentialCryptoService } from "../integrations/credential-crypto.service";

export interface OrgContactInput {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  mobilePhone?: string | null;
  title?: string | null;
  role?: string | null;
  contactType?: string | null;
  isPrimaryContact?: boolean;
  isAuthorisedSignatory?: boolean;
}

export interface OrgAddressInput {
  addressType?: string | null;
  line1?: string | null;
  line2?: string | null;
  suburb?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  postcode?: string | null;
}

export interface OrgCredentialInput {
  legalTradingName?: string | null;
  australianBusinessNumber?: string | null;
  australianCompanyNumber?: string | null;
  /** Plaintext TFN; encrypted at rest. "" clears it; undefined leaves it. */
  taxFileNumber?: string | null;
  industry?: string | null;
  entityType?: string | null;
  registrationNumber?: string | null;
  isRegisteredEntity?: boolean;
  acncRegistrationNumber?: string | null;
  acncStatus?: string | null;
  charitySubtype?: string | null;
  deductibleGiftRecipient?: boolean;
  dgrStatus?: string | null;
  financialYearEnd?: string | null;
}

/** OrgCredential with the encrypted TFN replaced by a presence flag — the only
 *  shape ever returned over the API (TFN is never decrypted to a client). */
type SafeCredential = Omit<OrgCredential, "taxFileNumber"> & { hasTaxFileNumber: boolean };

@Injectable()
export class OrgProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly outbox: OutboxService,
    private readonly crypto: CredentialCryptoService,
  ) {}

  private async ensureOrganization() {
    const slug = this.config.get<string>("DEFAULT_ORGANIZATION_SLUG", "default");
    return this.prisma.tenant.upsert({
      where: { slug },
      create: { slug, name: "Default Organization" },
      update: {},
    });
  }

  /** The single OrgProfile for the tenant, created lazily from the tenant name. */
  private async ensureProfile(): Promise<{ id: string; tenantId: string; name: string }> {
    const org = await this.ensureOrganization();
    const existing = await this.prisma.orgProfile.findFirst({ where: { tenantId: org.id } });
    if (existing) return existing;
    return this.prisma.orgProfile.create({ data: { tenantId: org.id, name: org.name } });
  }

  private maskCredential(c: OrgCredential | null): SafeCredential | null {
    if (!c) return null;
    const { taxFileNumber, ...rest } = c;
    return { ...rest, hasTaxFileNumber: !!taxFileNumber };
  }

  async getProfile() {
    const profile = await this.ensureProfile();
    const [contacts, addresses, credential] = await Promise.all([
      this.prisma.orgContact.findMany({ where: { orgProfileId: profile.id } }),
      this.prisma.orgAddress.findMany({ where: { orgProfileId: profile.id } }),
      this.prisma.orgCredential.findUnique({ where: { orgProfileId: profile.id } }),
    ]);
    return {
      id: profile.id,
      tenantId: profile.tenantId,
      name: profile.name,
      contacts,
      addresses,
      credential: this.maskCredential(credential),
    };
  }

  async updateProfile(input: { name?: string }) {
    const profile = await this.ensureProfile();
    if (input.name !== undefined && input.name.trim()) {
      await this.prisma.orgProfile.update({ where: { id: profile.id }, data: { name: input.name.trim() } });
    }
    return this.getProfile();
  }

  // ── Credential (TFN encrypted; emits an outbox event for payment sync) ──
  async setCredential(input: OrgCredentialInput): Promise<SafeCredential> {
    const profile = await this.ensureProfile();

    const data: Prisma.OrgCredentialUncheckedCreateInput = { orgProfileId: profile.id };
    const assign = <K extends keyof OrgCredentialInput>(key: K) => {
      const v = input[key];
      if (v !== undefined) (data as Record<string, unknown>)[key as string] = v;
    };
    (
      [
        "legalTradingName",
        "australianBusinessNumber",
        "australianCompanyNumber",
        "industry",
        "entityType",
        "registrationNumber",
        "isRegisteredEntity",
        "acncRegistrationNumber",
        "acncStatus",
        "charitySubtype",
        "deductibleGiftRecipient",
        "dgrStatus",
        "financialYearEnd",
      ] as const
    ).forEach(assign);

    // TFN: undefined = leave; "" = clear; value = encrypt.
    if (input.taxFileNumber !== undefined) {
      data.taxFileNumber = input.taxFileNumber ? this.crypto.encrypt(input.taxFileNumber) : null;
    }

    const { orgProfileId, ...updateData } = data;
    const saved = await this.prisma.$transaction(async (tx) => {
      const credential = await tx.orgCredential.upsert({
        where: { orgProfileId: profile.id },
        create: data,
        update: updateData,
      });
      await this.outbox.append(tx, {
        tenantId: profile.tenantId,
        eventType: "tenant.org-credential.updated",
        aggregateId: profile.id,
        payload: { orgProfileId: profile.id, tenantId: profile.tenantId },
      });
      return credential;
    });
    return this.maskCredential(saved)!;
  }

  /** Backend-only: the decrypted TFN (e.g. for a regulator filing). NEVER exposed
   *  via a controller — there is no API route that returns this. */
  async decryptTaxFileNumber(): Promise<string | null> {
    const profile = await this.ensureProfile();
    const credential = await this.prisma.orgCredential.findUnique({ where: { orgProfileId: profile.id } });
    if (!credential?.taxFileNumber) return null;
    return this.crypto.decrypt(credential.taxFileNumber);
  }

  // ── Contacts ────────────────────────────────────────────────────────
  async addContact(input: OrgContactInput) {
    const profile = await this.ensureProfile();
    return this.prisma.orgContact.create({ data: { orgProfileId: profile.id, ...this.contactData(input) } });
  }

  async updateContact(id: string, input: OrgContactInput) {
    const profile = await this.ensureProfile();
    const existing = await this.prisma.orgContact.findFirst({ where: { id, orgProfileId: profile.id } });
    if (!existing) throw new NotFoundException("Org contact not found");
    return this.prisma.orgContact.update({ where: { id }, data: this.contactData(input) });
  }

  async deleteContact(id: string): Promise<{ ok: true }> {
    const profile = await this.ensureProfile();
    const existing = await this.prisma.orgContact.findFirst({ where: { id, orgProfileId: profile.id } });
    if (!existing) throw new NotFoundException("Org contact not found");
    await this.prisma.orgContact.delete({ where: { id } });
    return { ok: true };
  }

  // ── Addresses ───────────────────────────────────────────────────────
  async addAddress(input: OrgAddressInput) {
    const profile = await this.ensureProfile();
    return this.prisma.orgAddress.create({ data: { orgProfileId: profile.id, ...input } });
  }

  async updateAddress(id: string, input: OrgAddressInput) {
    const profile = await this.ensureProfile();
    const existing = await this.prisma.orgAddress.findFirst({ where: { id, orgProfileId: profile.id } });
    if (!existing) throw new NotFoundException("Org address not found");
    return this.prisma.orgAddress.update({ where: { id }, data: input });
  }

  async deleteAddress(id: string): Promise<{ ok: true }> {
    const profile = await this.ensureProfile();
    const existing = await this.prisma.orgAddress.findFirst({ where: { id, orgProfileId: profile.id } });
    if (!existing) throw new NotFoundException("Org address not found");
    await this.prisma.orgAddress.delete({ where: { id } });
    return { ok: true };
  }

  private contactData(input: OrgContactInput): Prisma.OrgContactCreateWithoutOrgProfileInput {
    return {
      firstName: input.firstName ?? null,
      lastName: input.lastName ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      mobilePhone: input.mobilePhone ?? null,
      title: input.title ?? null,
      role: input.role ?? null,
      contactType: input.contactType ?? null,
      ...(input.isPrimaryContact !== undefined ? { isPrimaryContact: input.isPrimaryContact } : {}),
      ...(input.isAuthorisedSignatory !== undefined
        ? { isAuthorisedSignatory: input.isAuthorisedSignatory }
        : {}),
    };
  }
}
