import type { OrganisationAddressFormValues } from '../types';

export type AddressErrors = Partial<Record<string, string>>;

const ADDRESS_FIELDS = [
  'addressLine1',
  'suburb',
  'city',
  'state',
  'country',
  'postcode',
] as const;

export function validateAddress(address: Partial<Record<string, string>>): AddressErrors {
  const errors: AddressErrors = {};

  for (const field of ADDRESS_FIELDS) {
    const value = (address[field] ?? '').trim();
    if (value.length === 0) {
      const label = field === 'addressLine1' ? 'Address Line 1' : field.charAt(0).toUpperCase() + field.slice(1);
      errors[field] = `${label} is required`;
    }
  }

  return errors;
}

export function validateAddressesForm(values: Partial<OrganisationAddressFormValues>): {
  registered?: AddressErrors;
  billing?: AddressErrors;
} {
  const result: { registered?: AddressErrors; billing?: AddressErrors } = {};

  const registered = values.registered;
  if (registered) {
    const err = validateAddress(registered);
    if (Object.keys(err).length > 0) result.registered = err;
  }

  const billingSameAsRegistered = values.billingSameAsRegistered ?? false;
  if (!billingSameAsRegistered) {
    const billing = values.billing;
    if (billing) {
      const err = validateAddress(billing);
      if (Object.keys(err).length > 0) result.billing = err;
    }
  }

  return result;
}
