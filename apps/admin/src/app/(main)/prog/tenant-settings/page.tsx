'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/prog/ui/button';
import { Save, RefreshCw, Sparkles } from 'lucide-react';
import { AdminOrHigher } from '@/components/prog/protected-route';
import Breadcrumbs from '@/components/prog/shared/breadcrumbs';
import {
  NetworkForm,
  TenantForm,
  OrganisationForm,
  OrganisationProfileForm,
  OrganisationCredentialsForm,
  OrganisationContactsForm,
  OrganisationAddressesForm,
} from './components';
import type {
  NetworkFormValues,
  TenantFormValues,
  OrganisationFormValues,
  OrganisationProfileFormValues,
  OrganisationCredentialsFormValues,
  OrganisationContactFormValues,
  OrganisationAddressFormValues,
} from './types';
import { TelephonyStatusCard } from '@/components/telephony/telephony-status-card';
import { validateCredentialsForm, type CredentialsFormErrors } from './validation/credentials-validation';
import { validateTenantForm, type TenantFormErrors } from './validation/tenant-validation';
import { validateContactsForm, type ContactsFormErrors } from './validation/contacts-validation';
import { validateAddressesForm } from './validation/addresses-validation';

const DEFAULT_TENANT_VALUES: TenantFormValues = {
  subdomain: '',
  displayName: '',
  allowMemberInvitations: true,
  allowOrganisationCreation: true,
  requireEmailVerification: true,
  allowCrossOrganisationAccess: false,
  defaultOrganisationRole: 'member',
  invitationExpiryDays: 7,
  maxOrganisationsPerTenant: 10,
};

const DEFAULT_ADDRESS = {
  addressLine1: '',
  addressLine2: '',
  suburb: '',
  city: '',
  state: '',
  country: 'australia',
  postcode: '',
};

export default function TenantSettingsPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [credentialsErrors, setCredentialsErrors] = useState<CredentialsFormErrors>({});
  const [tenantErrors, setTenantErrors] = useState<TenantFormErrors>({});
  const [contactsErrors, setContactsErrors] = useState<ContactsFormErrors>({});
  const [addressErrors, setAddressErrors] = useState<{ registered?: Partial<Record<string, string>>; billing?: Partial<Record<string, string>> }>({});

  // Form state - initialised with static mock data
  const [networkValues, setNetworkValues] = useState<NetworkFormValues>({
    name: 'Default Network',
    planName: 'pro',
    subscriptionStatus: 'active',
  });
  const [tenantValues, setTenantValues] = useState<TenantFormValues>({
    ...DEFAULT_TENANT_VALUES,
    subdomain: 'acme',
    displayName: 'Acme Advocacy',
  });
  const [organisationValues, setOrganisationValues] = useState<OrganisationFormValues>({
    name: 'Acme Advocacy',
    description: 'A community organisation campaigning for a fairer future.',
  });
  const [profileValues, setProfileValues] = useState<OrganisationProfileFormValues>({
    bio: 'We organise communities to win on the issues that matter.',
    websiteUrl: 'https://acme-advocacy.org.au',
    facebookUrl: 'https://facebook.com/acmeadvocacy',
    twitterUrl: 'https://twitter.com/acmeadvocacy',
    linkedinUrl: 'https://linkedin.com/company/acmeadvocacy',
    instagramUrl: 'https://instagram.com/acmeadvocacy',
    logoUrl: 'https://example.com/logo.png',
    heroImageUrl: 'https://example.com/hero.jpg',
    primaryColor: '#3B82F6',
    secondaryColor: '#6366F1',
    customCss: '',
  });
  const [credentialsValues, setCredentialsValues] = useState<OrganisationCredentialsFormValues>({
    legalTradingName: 'Acme Advocacy Inc',
    identifierType: 'abn',
    australianBusinessNumber: '51 824 753 556',
    australianCompanyNumber: '',
    taxFileNumber: '',
    industry: 'human_rights',
    entityType: 'incorporated_association',
    acncRegistrationNumber: '',
    deductibleGiftRecipient: false,
  });
  const [contacts, setContacts] = useState<OrganisationContactFormValues[]>([
    { firstName: 'Jane', lastName: 'Doe', email: 'jane@acme-advocacy.org.au', phone: '02 9000 0000', mobilePhone: '0400 000 000', title: 'Executive Director', role: 'ceo', contactType: 'general', isPrimaryContact: true, isAuthorizedSignatory: true },
  ]);
  const [addressValues, setAddressValues] = useState<OrganisationAddressFormValues>({
    billingSameAsRegistered: true,
    billing: { ...DEFAULT_ADDRESS, addressLine1: '123 Main Street', suburb: 'Surry Hills', city: 'Sydney', state: 'NSW', postcode: '2010' },
    registered: { ...DEFAULT_ADDRESS, addressLine1: '123 Main Street', suburb: 'Surry Hills', city: 'Sydney', state: 'NSW', postcode: '2010' },
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    const credErrors = validateCredentialsForm(credentialsValues, { required: true });
    const tenErrors = validateTenantForm(tenantValues);
    const contErrors = validateContactsForm(contacts);
    const addrErrors = validateAddressesForm(addressValues);

    const hasCredErrors = Object.keys(credErrors).length > 0;
    const hasTenErrors = Object.keys(tenErrors).length > 0;
    const hasContErrors = Object.keys(contErrors).length > 0;
    const hasAddrErrors = !!(addrErrors.registered && Object.keys(addrErrors.registered).length > 0) ||
      !!(addrErrors.billing && Object.keys(addrErrors.billing).length > 0);

    if (hasCredErrors || hasTenErrors || hasContErrors || hasAddrErrors) {
      setCredentialsErrors(credErrors);
      setTenantErrors(tenErrors);
      setContactsErrors(contErrors);
      setAddressErrors(addrErrors);
      const sections: string[] = [];
      if (hasCredErrors) sections.push('Organisation Credentials');
      if (hasTenErrors) sections.push('Tenant');
      if (hasContErrors) sections.push('Organisation Contacts');
      if (hasAddrErrors) sections.push('Addresses');
      setMessage({ type: 'error', text: `Please fix the errors in: ${sections.join(', ')}` });
      return;
    }

    setCredentialsErrors({});
    setTenantErrors({});
    setContactsErrors({});
    setAddressErrors({});

    setIsSubmitting(true);
    // Static replica - save is a no-op
    setMessage({ type: 'success', text: 'Settings saved successfully' });
    setIsSubmitting(false);
  };

  return (
    <AdminOrHigher>
      <section className="page-stack">
        <div className="contents">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-6">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">Settings</h2>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => {}}
                className="border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button
                variant="outline"
                asChild
                className="border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <Link href="/admin/onboarding">
                  <Sparkles className="h-4 w-4 mr-2" />
                  Onboarding
                </Link>
              </Button>
              <Breadcrumbs items={[{ label: 'Home', href: '/dashboard' }, { label: 'Settings' }]} />
            </div>
          </div>

          {/* Message Display */}
          {message && (
            <div
              className={`rounded-md border p-3 ${
                message.type === 'success'
                  ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-500/20 dark:bg-green-500/15 dark:text-green-400'
                  : 'border-red-200 bg-red-50 text-red-800 dark:border-red-500/20 dark:bg-red-500/15 dark:text-red-400'
              }`}
            >
              {message.text}
            </div>
          )}

          <form onSubmit={handleSave} noValidate className="space-y-6">
            <NetworkForm values={networkValues} onChange={setNetworkValues} />
            <TenantForm values={tenantValues} onChange={setTenantValues} errors={tenantErrors} />
            <OrganisationForm values={organisationValues} onChange={setOrganisationValues} />
            <OrganisationProfileForm values={profileValues} onChange={setProfileValues} />
            <OrganisationCredentialsForm
              values={credentialsValues}
              onChange={setCredentialsValues}
              errors={credentialsErrors}
            />
            <OrganisationContactsForm contacts={contacts} onChange={setContacts} errors={contactsErrors} />
            <OrganisationAddressesForm
              values={addressValues}
              onChange={setAddressValues}
              errors={addressErrors}
            />

            {/* Save Button */}
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={isSubmitting}
                className="bg-black hover:bg-gray-800 dark:bg-white dark:hover:bg-gray-200 text-white dark:text-black"
              >
                <Save className="h-4 w-4 mr-2" />
                {isSubmitting ? 'Saving...' : 'Save Settings'}
              </Button>
            </div>
          </form>

          {/* Read-only telephony provisioning status (renders only when the
              tenant has numbers/runs and the feature flag is on). */}
          <div className="mt-6">
            <TelephonyStatusCard />
          </div>
        </div>
      </section>
    </AdminOrHigher>
  );
}
