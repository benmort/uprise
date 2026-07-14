"use client";

// General settings — the tenant's whole configuration as one tabbed surface (was the
// separate "branding" mock + the standalone /settings cards). Each tab saves on its own.
// Org/brand tabs persist via orgProfile.*; Tenant & Access via tenants.update; the last
// three tabs are the former /settings sections (shared from components/settings).
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Lock, Save, Settings } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import {
  orgProfile,
  tenants,
  type OrgProfileRecord,
  type OrgContactInput,
  type OrgAddressInput,
  type TenantRecord,
} from "@uprise/api-client";
import { AdminOrHigher } from "@/components/prog/protected-route";
import { FormSectionCard, FormInput, FormTextarea } from "@/components/prog/shared/forms";
import { Button } from "@/components/prog/ui/button";
import { ImageCropUpload } from "@/components/branding/image-crop-upload";
import {
  NetworkForm,
  TenantForm,
  OrganisationCredentialsForm,
  OrganisationContactsForm,
  OrganisationAddressesForm,
} from "./components";
import type {
  NetworkFormValues,
  TenantFormValues,
  OrganisationCredentialsFormValues,
  OrganisationContactFormValues,
  OrganisationAddressFormValues,
} from "./types";
import { TAB_SEGMENT, type PageTab } from "./sections";
import { SettingsTabSkeleton } from "./settings-tab-skeleton";
import {
  ResponderAlertsSettings,
  TenantFeatureFlagsEditor,
  TenantLockedSection,
  TenantQueueRedisPanel,
} from "@/components/settings/observability";
import { SecuritySettings } from "@/components/settings/security";
import { DeleteWorkspaceCard } from "@/components/settings/delete-workspace";
import { ComplianceSettings } from "@/components/settings/compliance";
import { IntegrationsSettings } from "@/components/settings/integrations";
import { getSession } from "@/lib/session";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

// Row 1 — any admin. "Tenant" (network + tenant identity) leads; "Access" keeps its
// slot but now holds only the Access Control card (see TenantForm's `section` prop).
const PRIMARY_TABS = [
  { key: "tenant", label: "Tenant" },
  { key: "organisation", label: "Organisation" },
  { key: "branding", label: "Branding" },
  { key: "business", label: "Business & Legal" },
  { key: "contacts", label: "Contacts" },
  { key: "addresses", label: "Addresses" },
  { key: "access", label: "Access" },
  { key: "integrations", label: "Integrations" },
  { key: "security", label: "Security" },
  { key: "compliance", label: "Compliance" },
  { key: "alerts", label: "Alerts" },
] as const;
// Row 2 — super-admin only. Rendered lock-badged + greyed, and the whole row only
// appears when isSuperAdmin (content stays defensively gated by TenantLockedSection).
const SUPERADMIN_TABS = [
  { key: "flags", label: "Feature Flags" },
  { key: "queue", label: "Queue & Redis" },
] as const;
// Tabs that fetch their own data and own their loading state (their content components
// render their own skeletons). They render straight away rather than waiting behind the
// settings skeleton, which reflects the orgProfile / tenant fetch only.
const SELF_CONTAINED_TABS: readonly PageTab[] = ["security", "compliance", "integrations", "alerts"];
// PageTab + the segment↔tab mapping live in ./sections (a non-client module) so the
// server route /settings/[section]/page.tsx can call sectionToTab without hitting the
// "use client" client-reference boundary. PRIMARY_TABS/SUPERADMIN_TABS keys must stay
// in sync with PageTab.

const EMPTY_ADDR = {
  addressLine1: "",
  addressLine2: "",
  suburb: "",
  city: "",
  state: "",
  country: "australia",
  postcode: "",
};

const DEFAULT_TENANT_FORM: TenantFormValues = {
  subdomain: "",
  displayName: "",
  allowMemberInvitations: true,
  allowOrganisationCreation: true,
  requireEmailVerification: true,
  allowCrossOrganisationAccess: false,
  defaultOrganisationRole: "member",
  invitationExpiryDays: 7,
  maxOrganisationsPerTenant: 10,
};

// ── record → form mappers (explicit; the API shape is camelCase + AU spelling) ──
function toCredentialsForm(c: OrgProfileRecord["credential"]): OrganisationCredentialsFormValues {
  return {
    legalTradingName: c?.legalTradingName ?? "",
    identifierType: c?.australianCompanyNumber ? "acn" : "abn",
    australianBusinessNumber: c?.australianBusinessNumber ?? "",
    australianCompanyNumber: c?.australianCompanyNumber ?? "",
    taxFileNumber: "", // never returned; blank means "leave as-is" on save
    industry: c?.industry ?? "",
    entityType: c?.entityType ?? "",
    acncRegistrationNumber: c?.acncRegistrationNumber ?? "",
    deductibleGiftRecipient: c?.deductibleGiftRecipient ?? false,
  };
}
function toContactsForm(rows: OrgProfileRecord["contacts"]): OrganisationContactFormValues[] {
  if (!rows.length) {
    return [
      {
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        mobilePhone: "",
        title: "",
        role: "",
        contactType: "general",
        isPrimaryContact: true,
        isAuthorizedSignatory: true,
      },
    ];
  }
  return rows.map((r) => ({
    firstName: r.firstName ?? "",
    lastName: r.lastName ?? "",
    email: r.email ?? "",
    phone: r.phone ?? "",
    mobilePhone: r.mobilePhone ?? "",
    title: r.title ?? "",
    role: r.role ?? "",
    contactType: r.contactType ?? "general",
    isPrimaryContact: r.isPrimaryContact,
    isAuthorizedSignatory: r.isAuthorisedSignatory,
  }));
}
function toAddressesForm(rows: OrgProfileRecord["addresses"]): OrganisationAddressFormValues {
  const pick = (type: string) => {
    const a = rows.find((r) => r.addressType === type);
    return a
      ? {
          addressLine1: a.line1 ?? "",
          addressLine2: a.line2 ?? "",
          suburb: a.suburb ?? "",
          city: a.city ?? "",
          state: a.state ?? "",
          country: a.country ?? "australia",
          postcode: a.postcode ?? "",
        }
      : { ...EMPTY_ADDR };
  };
  return { registered: pick("registered"), billing: pick("billing"), billingSameAsRegistered: false };
}

// ── form → API input mappers ────────────────────────────────────────────────
function contactToInput(c: OrganisationContactFormValues): OrgContactInput {
  return {
    firstName: c.firstName || null,
    lastName: c.lastName || null,
    email: c.email || null,
    phone: c.phone || null,
    mobilePhone: c.mobilePhone || null,
    title: c.title || null,
    role: c.role || null,
    contactType: c.contactType || null,
    isPrimaryContact: c.isPrimaryContact,
    isAuthorisedSignatory: c.isAuthorizedSignatory,
  };
}
function addrToInput(addressType: string, a: OrganisationAddressFormValues["registered"]): OrgAddressInput {
  return {
    addressType,
    line1: a.addressLine1 || null,
    line2: a.addressLine2 || null,
    suburb: a.suburb || null,
    city: a.city || null,
    state: a.state || null,
    country: a.country || null,
    postcode: a.postcode || null,
  };
}

export function GeneralSettings({ activeTab }: { activeTab: PageTab }) {
  const { showToast } = useToast();
  // The active tab is the URL section (/settings/[section]); no local tab state.
  const tab = activeTab;
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [savingTab, setSavingTab] = useState<PageTab | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);

  // Brand + org identity (Organisation + Branding tabs → orgProfile.update).
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [facebookUrl, setFacebookUrl] = useState("");
  const [twitterUrl, setTwitterUrl] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [logoBlockUrl, setLogoBlockUrl] = useState<string | null>(null);
  const [logoLandscapeUrl, setLogoLandscapeUrl] = useState<string | null>(null);
  const [faviconUrl, setFaviconUrl] = useState<string | null>(null);
  const [heroImageUrl, setHeroImageUrl] = useState<string | null>(null);
  const [primaryColour, setPrimaryColour] = useState("#3B82F6");
  const [secondaryColour, setSecondaryColour] = useState("#6366F1");
  const [customCss, setCustomCss] = useState("");

  // Reused section components' controlled state.
  const [credentials, setCredentials] = useState<OrganisationCredentialsFormValues>(toCredentialsForm(null));
  const [contacts, setContacts] = useState<OrganisationContactFormValues[]>(toContactsForm([]));
  const [addresses, setAddresses] = useState<OrganisationAddressFormValues>(toAddressesForm([]));

  // Tenant & Access (tenants.get / update).
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenantRec, setTenantRec] = useState<TenantRecord | null>(null);
  const [tenantForm, setTenantForm] = useState<TenantFormValues>(DEFAULT_TENANT_FORM);
  const [networkForm, setNetworkForm] = useState<NetworkFormValues>({ name: "" });

  const applyRecord = useCallback((p: OrgProfileRecord) => {
    setName(p.name ?? "");
    setBio(p.bio ?? "");
    setWebsiteUrl(p.websiteUrl ?? "");
    setFacebookUrl(p.facebookUrl ?? "");
    setTwitterUrl(p.twitterUrl ?? "");
    setLinkedinUrl(p.linkedinUrl ?? "");
    setInstagramUrl(p.instagramUrl ?? "");
    setLogoBlockUrl(p.logoBlockUrl);
    setLogoLandscapeUrl(p.logoLandscapeUrl);
    setFaviconUrl(p.faviconUrl);
    setHeroImageUrl(p.heroImageUrl);
    setPrimaryColour(p.primaryColour ?? "#3B82F6");
    setSecondaryColour(p.secondaryColour ?? "#6366F1");
    setCustomCss(p.customCss ?? "");
    setCredentials(toCredentialsForm(p.credential));
    setContacts(toContactsForm(p.contacts));
    setAddresses(toAddressesForm(p.addresses));
  }, []);

  const applyTenant = useCallback((t: TenantRecord) => {
    setTenantRec(t);
    const ac = ((t.settings as Record<string, unknown> | null)?.accessControl ?? {}) as Record<string, unknown>;
    setTenantForm({
      subdomain: t.slug,
      displayName: t.name,
      allowMemberInvitations: Boolean(ac.allowMemberInvitations ?? true),
      allowOrganisationCreation: Boolean(ac.allowOrganisationCreation ?? true),
      requireEmailVerification: Boolean(ac.requireEmailVerification ?? true),
      allowCrossOrganisationAccess: Boolean(ac.allowCrossOrganisationAccess ?? false),
      defaultOrganisationRole: String(ac.defaultOrganisationRole ?? "member"),
      invitationExpiryDays: Number(ac.invitationExpiryDays ?? 7),
      maxOrganisationsPerTenant: Number(ac.maxOrganisationsPerTenant ?? 10),
    });
    setNetworkForm({ name: t.network?.name ?? "", planName: t.network?.planName ?? undefined });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const session = await getSession();
    setIsSuperAdmin(session?.isSuperAdmin === true);
    setRole(session?.role ?? null);
    setSessionLoaded(true);
    const tid = session?.activeTenant?.id ?? session?.tenantId ?? null;
    setTenantId(tid);
    const [profileRes, tenantRes] = await Promise.all([
      orgProfile.get(),
      tid ? tenants.get(tid) : Promise.resolve(null),
    ]);
    setLoading(false);
    if (!profileRes.ok) {
      setLoadError(profileRes.error);
      return;
    }
    setLoadError("");
    applyRecord(profileRes.data);
    if (tenantRes && tenantRes.ok) applyTenant(tenantRes.data);
  }, [applyRecord, applyTenant]);
  useEffect(() => {
    void load();
  }, [load]);

  const done = (message: string, reload = true) => {
    showToast({ tone: "success", title: message });
    if (reload) void load();
  };
  const fail = (error: string) => showToast({ tone: "error", title: "Couldn't save", description: error });

  const saveOrganisation = async () => {
    setSavingTab("organisation");
    const res = await orgProfile.update({
      name: name.trim() || undefined,
      bio: bio || null,
      websiteUrl: websiteUrl || null,
      facebookUrl: facebookUrl || null,
      twitterUrl: twitterUrl || null,
      linkedinUrl: linkedinUrl || null,
      instagramUrl: instagramUrl || null,
    });
    setSavingTab(null);
    if (res.ok) done("Organisation saved", false);
    else fail(res.error);
  };

  const saveBranding = async () => {
    setSavingTab("branding");
    // Logos & images live on this tab now, so this save persists them alongside
    // the brand colours + custom CSS.
    const res = await orgProfile.update({
      logoBlockUrl,
      logoLandscapeUrl,
      faviconUrl,
      heroImageUrl,
      primaryColour: primaryColour || null,
      secondaryColour: secondaryColour || null,
      customCss: customCss || null,
    });
    setSavingTab(null);
    if (res.ok) done("Branding saved", false);
    else fail(res.error);
  };

  // Images persist the moment they're uploaded/removed — no manual Save. The file is
  // already in blob storage by the time onChange fires (ImageCropUpload uploaded it), so
  // this just writes the URL onto the org profile. updateProfile is a partial PATCH, so
  // saving one field leaves colours/CSS (and the other images) untouched.
  const autoSaveImage =
    (field: "logoBlockUrl" | "logoLandscapeUrl" | "faviconUrl" | "heroImageUrl", setLocal: (v: string | null) => void) =>
    async (url: string | null) => {
      setLocal(url);
      const res = await orgProfile.update({ [field]: url });
      if (res.ok) done(url ? "Image saved" : "Image removed", false);
      else fail(res.error);
    };

  const saveBusiness = async () => {
    setSavingTab("business");
    const res = await orgProfile.setCredential({
      legalTradingName: credentials.legalTradingName || null,
      australianBusinessNumber: credentials.identifierType === "abn" ? credentials.australianBusinessNumber || null : null,
      australianCompanyNumber: credentials.identifierType === "acn" ? credentials.australianCompanyNumber || null : null,
      // Blank leaves the stored TFN untouched; a value re-encrypts it.
      ...(credentials.taxFileNumber ? { taxFileNumber: credentials.taxFileNumber } : {}),
      industry: credentials.industry || null,
      entityType: credentials.entityType || null,
      acncRegistrationNumber: credentials.acncRegistrationNumber || null,
      deductibleGiftRecipient: credentials.deductibleGiftRecipient,
      isRegisteredEntity: Boolean(credentials.australianBusinessNumber || credentials.australianCompanyNumber),
    });
    setSavingTab(null);
    if (res.ok) done("Business details saved");
    else fail(res.error);
  };

  // Contacts + addresses are lists; reconcile by replacing the server set with the
  // form set (delete-all → recreate). Simple + correct for a settings surface.
  const saveContacts = async () => {
    setSavingTab("contacts");
    const cur = await orgProfile.get();
    if (!cur.ok) {
      setSavingTab(null);
      return fail(cur.error);
    }
    for (const c of cur.data.contacts) await orgProfile.deleteContact(c.id);
    for (const c of contacts) {
      if (!c.firstName && !c.lastName && !c.email) continue; // skip empty rows
      const res = await orgProfile.addContact(contactToInput(c));
      if (!res.ok) {
        setSavingTab(null);
        return fail(res.error);
      }
    }
    setSavingTab(null);
    done("Contacts saved");
  };

  const saveAddresses = async () => {
    setSavingTab("addresses");
    const cur = await orgProfile.get();
    if (!cur.ok) {
      setSavingTab(null);
      return fail(cur.error);
    }
    for (const a of cur.data.addresses) await orgProfile.deleteAddress(a.id);
    const billing = addresses.billingSameAsRegistered ? addresses.registered : addresses.billing;
    for (const [type, a] of [
      ["registered", addresses.registered],
      ["billing", billing],
    ] as const) {
      const res = await orgProfile.addAddress(addrToInput(type, a));
      if (!res.ok) {
        setSavingTab(null);
        return fail(res.error);
      }
    }
    setSavingTab(null);
    done("Addresses saved");
  };

  const saveAccess = async () => {
    if (!tenantId) {
      fail("No active tenant to configure.");
      return;
    }
    setSavingTab("access");
    const prev = (tenantRec?.settings ?? {}) as Record<string, unknown>;
    const res = await tenants.update(tenantId, {
      name: tenantForm.displayName.trim() || undefined,
      settings: {
        ...prev,
        accessControl: {
          allowMemberInvitations: tenantForm.allowMemberInvitations,
          allowOrganisationCreation: tenantForm.allowOrganisationCreation,
          requireEmailVerification: tenantForm.requireEmailVerification,
          allowCrossOrganisationAccess: tenantForm.allowCrossOrganisationAccess,
          defaultOrganisationRole: tenantForm.defaultOrganisationRole,
          invitationExpiryDays: tenantForm.invitationExpiryDays,
          maxOrganisationsPerTenant: tenantForm.maxOrganisationsPerTenant,
        },
      },
    });
    setSavingTab(null);
    if (res.ok) {
      applyTenant(res.data);
      done("Tenant settings saved", false);
    } else {
      fail(res.error);
    }
  };

  const SaveButton = ({ onClick, tabKey }: { onClick: () => void; tabKey: PageTab }) => (
    <div className="flex justify-end">
      <Button onClick={onClick} disabled={savingTab !== null}>
        {savingTab === tabKey ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
          </>
        ) : (
          <>
            <Save className="mr-2 h-4 w-4" /> Save
          </>
        )}
      </Button>
    </div>
  );

  return (
    <AdminOrHigher>
      <section className="page-stack">
        <PageHeader
          icon={Settings}
          title="General settings"
          description="Your workspace identity, brand assets, legal details and operational preferences. Each tab saves on its own."
        />

        {/* Tab pills — row 1 for any admin; row 2 (super-admin only) is lock-badged
            and greyed, and only rendered when the session is a super-admin. */}
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1 rounded-xl border border-border p-0.5">
            {PRIMARY_TABS.map((t) => (
              <Link
                key={t.key}
                href={`/settings/${TAB_SEGMENT[t.key]}`}
                aria-current={tab === t.key ? "page" : undefined}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-semibold transition",
                  tab === t.key ? "bg-primary text-white" : "text-foreground hover:bg-surface-variant",
                )}
              >
                {t.label}
              </Link>
            ))}
          </div>
          {isSuperAdmin ? (
            <div className="flex flex-wrap items-center gap-1 rounded-xl border border-dashed border-border/70 bg-surface-variant/30 p-0.5">
              <span className="px-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Super-admin
              </span>
              {SUPERADMIN_TABS.map((t) => (
                <Link
                  key={t.key}
                  href={`/settings/${TAB_SEGMENT[t.key]}`}
                  aria-current={tab === t.key ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition",
                    tab === t.key
                      ? "bg-primary text-white"
                      : "text-muted-foreground hover:bg-surface-variant hover:text-foreground",
                  )}
                >
                  <Lock className="h-3 w-3" />
                  {t.label}
                </Link>
              ))}
            </div>
          ) : null}
        </div>

        {loadError ? (
          <div className="rounded-md border border-error/30 bg-error-container/40 p-3 text-sm text-error">
            Couldn&apos;t load settings: {loadError}
          </div>
        ) : null}

        {loading && !SELF_CONTAINED_TABS.includes(tab) ? (
          <SettingsTabSkeleton tab={tab} />
        ) : (
          <div className="space-y-6">
            {tab === "tenant" ? (
              <>
                <NetworkForm values={networkForm} onChange={setNetworkForm} disabled />
                <TenantForm values={tenantForm} onChange={setTenantForm} section="tenant" />
                {tenantId ? (
                  <SaveButton onClick={() => void saveAccess()} tabKey="access" />
                ) : (
                  <p className="text-sm text-muted-foreground">No active tenant to configure.</p>
                )}
                <DeleteWorkspaceCard role={role} isSuperAdmin={isSuperAdmin} sessionLoaded={sessionLoaded} />
              </>
            ) : null}

            {tab === "organisation" ? (
              <>
                <FormSectionCard title="Organisation" description="Your public name and description.">
                  <FormInput label="Organisation name" value={name} onChange={(e) => setName(e.target.value)} />
                  <FormTextarea label="Bio" rows={3} value={bio} onChange={(e) => setBio(e.target.value)} />
                </FormSectionCard>

                <FormSectionCard title="Profile & social">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormInput label="Website" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://…" />
                    <FormInput label="Facebook" value={facebookUrl} onChange={(e) => setFacebookUrl(e.target.value)} />
                    <FormInput label="Twitter / X" value={twitterUrl} onChange={(e) => setTwitterUrl(e.target.value)} />
                    <FormInput label="LinkedIn" value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} />
                    <FormInput label="Instagram" value={instagramUrl} onChange={(e) => setInstagramUrl(e.target.value)} />
                  </div>
                </FormSectionCard>

                <SaveButton onClick={() => void saveOrganisation()} tabKey="organisation" />
              </>
            ) : null}

            {tab === "branding" ? (
              <>
                <FormSectionCard title="Logos & images" description="Upload and crop — saved automatically. Logos keep transparency (PNG).">
                  <div className="grid gap-6 sm:grid-cols-2">
                    <ImageCropUpload label="Block logo" helpText="Square, for tight spaces." value={logoBlockUrl} onChange={autoSaveImage("logoBlockUrl", setLogoBlockUrl)} aspect={1} boxClassName="h-40" />
                    <ImageCropUpload label="Landscape logo" helpText="Wide, for headers and email." value={logoLandscapeUrl} onChange={autoSaveImage("logoLandscapeUrl", setLogoLandscapeUrl)} aspect={3} boxClassName="h-24" />
                    <ImageCropUpload label="Favicon" helpText="Square, browser tab icon." value={faviconUrl} onChange={autoSaveImage("faviconUrl", setFaviconUrl)} aspect={1} boxClassName="h-28" />
                    <ImageCropUpload label="Hero image" helpText="Wide banner (JPEG)." value={heroImageUrl} onChange={autoSaveImage("heroImageUrl", setHeroImageUrl)} aspect={16 / 9} mimeType="image/jpeg" boxClassName="h-40" />
                  </div>
                </FormSectionCard>

                <FormSectionCard title="Brand colours" description="Used across your public surfaces.">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="flex items-center gap-3">
                      <input type="color" value={primaryColour} onChange={(e) => setPrimaryColour(e.target.value)} className="h-10 w-14 cursor-pointer rounded border border-border bg-surface" aria-label="Primary colour" />
                      <FormInput label="Primary colour" value={primaryColour} onChange={(e) => setPrimaryColour(e.target.value)} className="font-mono" />
                    </div>
                    <div className="flex items-center gap-3">
                      <input type="color" value={secondaryColour} onChange={(e) => setSecondaryColour(e.target.value)} className="h-10 w-14 cursor-pointer rounded border border-border bg-surface" aria-label="Secondary colour" />
                      <FormInput label="Secondary colour" value={secondaryColour} onChange={(e) => setSecondaryColour(e.target.value)} className="font-mono" />
                    </div>
                  </div>
                </FormSectionCard>

                <FormSectionCard title="Custom styling" description="Advanced: white-label CSS applied to your public pages.">
                  <FormTextarea label="Custom CSS" rows={8} value={customCss} onChange={(e) => setCustomCss(e.target.value)} className="font-mono text-xs" placeholder=":root { --brand: #… }" />
                </FormSectionCard>

                <SaveButton onClick={() => void saveBranding()} tabKey="branding" />
              </>
            ) : null}

            {tab === "business" ? (
              <>
                <OrganisationCredentialsForm values={credentials} onChange={setCredentials} />
                <SaveButton onClick={() => void saveBusiness()} tabKey="business" />
              </>
            ) : null}

            {tab === "contacts" ? (
              <>
                <OrganisationContactsForm contacts={contacts} onChange={setContacts} />
                <SaveButton onClick={() => void saveContacts()} tabKey="contacts" />
              </>
            ) : null}

            {tab === "addresses" ? (
              <>
                <OrganisationAddressesForm values={addresses} onChange={setAddresses} />
                <SaveButton onClick={() => void saveAddresses()} tabKey="addresses" />
              </>
            ) : null}

            {tab === "access" ? (
              <>
                <TenantForm values={tenantForm} onChange={setTenantForm} section="access" />
                {tenantId ? (
                  <SaveButton onClick={() => void saveAccess()} tabKey="access" />
                ) : (
                  <p className="text-sm text-muted-foreground">No active tenant to configure.</p>
                )}
              </>
            ) : null}

            {tab === "security" ? <SecuritySettings /> : null}

            {tab === "compliance" ? <ComplianceSettings /> : null}

            {tab === "integrations" ? <IntegrationsSettings /> : null}

            {tab === "alerts" ? <ResponderAlertsSettings /> : null}

            {tab === "flags" ? (
              <TenantLockedSection
                title="Tenant Feature Flags"
                subtitle="Feature-flag overrides for the current tenant."
                locked={!isSuperAdmin}
              >
                <TenantFeatureFlagsEditor />
              </TenantLockedSection>
            ) : null}

            {tab === "queue" ? (
              <TenantLockedSection
                title="Tenant Queue & Redis Stats"
                subtitle="Async-work health for the current tenant."
                locked={!isSuperAdmin}
              >
                <TenantQueueRedisPanel />
              </TenantLockedSection>
            ) : null}
          </div>
        )}
      </section>
    </AdminOrHigher>
  );
}
