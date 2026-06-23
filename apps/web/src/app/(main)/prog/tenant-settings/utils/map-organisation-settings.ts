import type {
  OrganisationCredentialsFormValues,
  OrganisationContactFormValues,
  OrganisationAddressFormValues,
} from '../types';

const DEFAULT_ADDRESS = {
  addressLine1: '',
  addressLine2: '',
  suburb: '',
  city: '',
  state: '',
  country: 'australia',
  postcode: '',
};

export function mapCredentialsToForm(c: Record<string, unknown> | null): OrganisationCredentialsFormValues {
  if (!c) {
    return {
      legalTradingName: '',
      identifierType: 'abn',
      australianBusinessNumber: '',
      australianCompanyNumber: '',
      taxFileNumber: '',
      industry: '',
      entityType: '',
      acncRegistrationNumber: '',
      deductibleGiftRecipient: false,
    };
  }
  return {
    legalTradingName: String(c.legalTradingName ?? c.legal_trading_name ?? ''),
    identifierType: (c.australianCompanyNumber ?? c.australian_company_number) ? 'acn' : 'abn',
    australianBusinessNumber: String(c.australianBusinessNumber ?? c.australian_business_number ?? ''),
    australianCompanyNumber: String(c.australianCompanyNumber ?? c.australian_company_number ?? ''),
    taxFileNumber: String(c.taxFileNumber ?? c.tax_file_number ?? ''),
    industry: String(c.industry ?? ''),
    entityType: String(c.entityType ?? c.entity_type ?? ''),
    acncRegistrationNumber: String(c.acncRegistrationNumber ?? c.acnc_registration_number ?? ''),
    deductibleGiftRecipient: Boolean(c.deductibleGiftRecipient ?? c.deductible_gift_recipient ?? false),
  };
}

export function mapContactsToForm(contacts: unknown[]): OrganisationContactFormValues[] {
  if (!Array.isArray(contacts) || contacts.length === 0) {
    return [{
      firstName: '', lastName: '', email: '', phone: '', mobilePhone: '', title: '', role: '',
      contactType: 'general', isPrimaryContact: true, isAuthorizedSignatory: true,
    }];
  }
  return contacts.map((x) => {
    const r = x as Record<string, unknown>;
    return {
      id: r.id as number | undefined,
      firstName: String(r.firstName ?? r.first_name ?? ''),
      lastName: String(r.lastName ?? r.last_name ?? ''),
      email: String(r.email ?? ''),
      phone: String(r.phone ?? ''),
      mobilePhone: String(r.mobilePhone ?? r.mobile_phone ?? ''),
      title: String(r.title ?? ''),
      role: String(r.role ?? ''),
      contactType: String(r.contactType ?? r.contact_type ?? 'general'),
      isPrimaryContact: Boolean(r.isPrimaryContact ?? r.is_primary_contact ?? false),
      isAuthorizedSignatory: Boolean(r.isAuthorizedSignatory ?? r.is_authorized_signatory ?? false),
    };
  });
}

function toAddr(a: Record<string, unknown> | null) {
  if (!a) return { ...DEFAULT_ADDRESS };
  return {
    addressLine1: String(a.addressLine1 ?? a.address_line_1 ?? ''),
    addressLine2: String(a.addressLine2 ?? a.address_line_2 ?? ''),
    suburb: String(a.suburb ?? ''),
    city: String(a.city ?? ''),
    state: String(a.state ?? ''),
    country: String(a.country ?? 'australia'),
    postcode: String(a.postcode ?? ''),
  };
}

export function mapAddressesToForm(addresses: { registered?: unknown; billing?: unknown } | null): OrganisationAddressFormValues {
  if (!addresses) {
    return {
      billing: { ...DEFAULT_ADDRESS },
      registered: { ...DEFAULT_ADDRESS },
      billingSameAsRegistered: true,
    };
  }
  const reg = toAddr(addresses.registered as Record<string, unknown> | null);
  const bill = toAddr(addresses.billing as Record<string, unknown> | null);
  return {
    registered: reg,
    billing: bill,
  };
}
