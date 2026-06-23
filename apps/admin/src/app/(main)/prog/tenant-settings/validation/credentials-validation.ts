import type { OrganisationCredentialsFormValues, OrganisationIdentifierType } from '../types';

const ENTITY_TYPES_WITH_ACN = ['company', 'company_limited_by_guarantee'];

/**
 * Validate Australian Business Number (ABN).
 * ABN is 11 digits with a weighted checksum (mod 89).
 */
function validateABN(value: string): string | undefined {
  const digits = value.replace(/\s/g, '');
  if (digits.length === 0) return 'ABN is required';
  if (!/^\d+$/.test(digits)) return 'ABN must contain only numbers';
  if (digits.length !== 11) return 'ABN must be 11 digits';

  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  let sum = 0;
  for (let i = 0; i < 11; i++) {
    const digit = parseInt(digits[i], 10);
    sum += (i === 0 ? digit - 1 : digit) * weights[i];
  }
  if (sum % 89 !== 0) return 'Invalid ABN (checksum failed)';
  return undefined;
}

/**
 * Validate Australian Company Number (ACN).
 * ACN is 9 digits with a weighted checksum.
 */
function validateACN(value: string): string | undefined {
  const digits = value.replace(/\s/g, '');
  if (digits.length === 0) return 'ACN is required';
  if (!/^\d+$/.test(digits)) return 'ACN must contain only numbers';
  if (digits.length !== 9) return 'ACN must be 9 digits';

  const weights = [8, 7, 6, 5, 4, 3, 2, 1];
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    sum += parseInt(digits[i], 10) * weights[i];
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  if (checkDigit !== parseInt(digits[8], 10)) return 'Invalid ACN (checksum failed)';
  return undefined;
}

/**
 * Validate TFN (Tax File Number). Optional field - 8 or 9 digits if provided.
 */
function validateTFN(value: string): string | undefined {
  if (!value || value.trim().length === 0) return undefined;
  const digits = value.replace(/\s/g, '');
  if (!/^\d+$/.test(digits)) return 'TFN must contain only numbers';
  if (digits.length !== 8 && digits.length !== 9) return 'TFN must be 8 or 9 digits';
  return undefined;
}

/**
 * Validate ACNC registration number. Format: 6 alphanumeric characters (e.g. ABC123).
 */
function validateACNC(value: string): string | undefined {
  if (!value || value.trim().length === 0) return undefined;
  const cleaned = value.trim().toUpperCase();
  if (!/^[A-Z0-9]{4,6}$/.test(cleaned)) return 'ACNC number must be 4–6 alphanumeric characters';
  return undefined;
}

export type CredentialsFormErrors = Partial<Record<keyof OrganisationCredentialsFormValues, string>>;

export function validateCredentialsForm(
  values: Partial<OrganisationCredentialsFormValues>,
  options?: { required?: boolean }
): CredentialsFormErrors {
  const errors: CredentialsFormErrors = {};
  const required = options?.required ?? true;

  const legalTradingName = (values.legalTradingName ?? '').trim();
  if (required && legalTradingName.length === 0) {
    errors.legalTradingName = 'Legal trading name is required';
  } else if (legalTradingName.length > 0 && legalTradingName.length < 2) {
    errors.legalTradingName = 'Legal trading name must be at least 2 characters';
  }

  const entityType = values.entityType ?? '';
  if (required && !entityType) {
    errors.entityType = 'Entity type is required';
  }

  const identifierType = (values.identifierType ?? 'abn') as OrganisationIdentifierType;
  const canUseAcn = ENTITY_TYPES_WITH_ACN.includes(entityType);

  if (identifierType === 'abn') {
    const abn = (values.australianBusinessNumber ?? '').trim();
    if (required && abn.length === 0) {
      errors.australianBusinessNumber = 'ABN is required';
    } else if (abn.length > 0) {
      const abnError = validateABN(abn);
      if (abnError) errors.australianBusinessNumber = abnError;
    }
  } else if (identifierType === 'acn' && canUseAcn) {
    const acn = (values.australianCompanyNumber ?? '').trim();
    if (required && acn.length === 0) {
      errors.australianCompanyNumber = 'ACN is required';
    } else if (acn.length > 0) {
      const acnError = validateACN(acn);
      if (acnError) errors.australianCompanyNumber = acnError;
    }
  }

  const industry = values.industry ?? '';
  if (required && !industry) {
    errors.industry = 'Sector / industry is required';
  }

  const tfnError = validateTFN(values.taxFileNumber ?? '');
  if (tfnError) errors.taxFileNumber = tfnError;

  const isCharity = entityType === 'charity';
  if (isCharity) {
    const acncError = validateACNC(values.acncRegistrationNumber ?? '');
    if (acncError) errors.acncRegistrationNumber = acncError;
  }

  return errors;
}
