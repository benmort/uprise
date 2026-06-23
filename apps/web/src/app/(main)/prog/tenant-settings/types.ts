/**
 * Types for tenant settings forms.
 * Mirrors tenant-service schema where applicable.
 */

export interface NetworkFormValues {
  name: string;
  planName?: string;
  subscriptionStatus?: string;
}

export interface TenantFormValues {
  subdomain: string;
  displayName: string;
  allowMemberInvitations: boolean;
  allowOrganisationCreation: boolean;
  requireEmailVerification: boolean;
  allowCrossOrganisationAccess: boolean;
  defaultOrganisationRole: string;
  invitationExpiryDays: number;
  maxOrganisationsPerTenant: number;
}

export interface OrganisationFormValues {
  name: string;
  description: string;
}

export interface OrganisationProfileFormValues {
  bio: string;
  websiteUrl: string;
  facebookUrl: string;
  twitterUrl: string;
  linkedinUrl: string;
  instagramUrl: string;
  logoUrl: string;
  heroImageUrl: string;
  primaryColor: string;
  secondaryColor: string;
  customCss: string;
}

export type OrganisationIdentifierType = 'abn' | 'acn';

export interface OrganisationCredentialsFormValues {
  legalTradingName: string;
  identifierType: OrganisationIdentifierType;
  australianBusinessNumber: string;
  australianCompanyNumber: string;
  taxFileNumber: string;
  industry: string;
  entityType: string;
  acncRegistrationNumber: string;
  deductibleGiftRecipient: boolean;
}

export interface OrganisationContactFormValues {
  id?: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  mobilePhone: string;
  title: string;
  role: string;
  contactType: string;
  isPrimaryContact: boolean;
  isAuthorizedSignatory: boolean;
}

export interface OrganisationAddressFormValues {
  billing: {
    addressLine1: string;
    addressLine2: string;
    suburb: string;
    city: string;
    state: string;
    country: string;
    postcode: string;
  };
  registered: {
    addressLine1: string;
    addressLine2: string;
    suburb: string;
    city: string;
    state: string;
    country: string;
    postcode: string;
  };
  /** When true, billing address is the same as registered (billing fields are hidden) */
  billingSameAsRegistered?: boolean;
}
