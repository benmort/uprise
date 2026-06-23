import type { TenantFormValues } from '../types';

export type TenantFormErrors = Partial<Record<keyof TenantFormValues, string>>;

export function validateTenantForm(values: Partial<TenantFormValues>): TenantFormErrors {
  const errors: TenantFormErrors = {};

  const displayName = (values.displayName ?? '').trim();
  if (displayName.length === 0) {
    errors.displayName = 'Display name is required';
  } else if (displayName.length < 2) {
    errors.displayName = 'Display name must be at least 2 characters';
  }

  const invitationExpiryDays = values.invitationExpiryDays ?? 7;
  if (invitationExpiryDays < 1 || invitationExpiryDays > 30) {
    errors.invitationExpiryDays = 'Invitation expiry must be between 1 and 30 days';
  }

  const maxOrganisationsPerTenant = values.maxOrganisationsPerTenant ?? 10;
  if (maxOrganisationsPerTenant < 1 || maxOrganisationsPerTenant > 100) {
    errors.maxOrganisationsPerTenant = 'Maximum organisations must be between 1 and 100';
  }

  return errors;
}
