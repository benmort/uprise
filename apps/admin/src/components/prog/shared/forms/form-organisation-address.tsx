'use client';

import * as React from 'react';
import { FormInput } from './form-input';
import { FormSelect, type FormSelectOption } from './form-select';

export type OrganisationAddressType = 'billing' | 'registered';

export interface OrganisationAddressFormValues {
  addressLine1: string;
  addressLine2: string;
  suburb: string;
  city: string;
  state: string;
  country: string;
  postcode: string;
}

export type AddressFieldErrors = Partial<Record<keyof OrganisationAddressFormValues, string>>;

export interface FormOrganisationAddressProps {
  /** Address type label (billing, registered) */
  addressType: OrganisationAddressType;
  /** Optional field name prefix for form submission */
  namePrefix?: string;
  /** Controlled values */
  values?: Partial<OrganisationAddressFormValues>;
  /** Change handler for controlled mode */
  onChange?: (values: OrganisationAddressFormValues) => void;
  /** Whether required fields are enforced (all except Address Line 2) */
  required?: boolean;
  /** Validation errors per field */
  errors?: AddressFieldErrors;
  /** Country options - defaults to Australia + common countries */
  countryOptions?: FormSelectOption[];
  /** Additional class for the container */
  className?: string;
}

const DEFAULT_COUNTRIES: FormSelectOption[] = [
  { value: 'australia', label: 'Australia' },
  { value: 'america', label: 'America' },
  { value: 'england', label: 'England' },
  { value: 'new-zealand', label: 'New Zealand' },
  { value: 'canada', label: 'Canada' },
  { value: 'germany', label: 'Germany' },
  { value: 'france', label: 'France' },
  { value: 'japan', label: 'Japan' },
];

const ADDRESS_TYPE_LABELS: Record<OrganisationAddressType, string> = {
  billing: 'Billing Address',
  registered: 'Registered Address',
};

export function FormOrganisationAddress({
  addressType,
  namePrefix,
  values = {},
  onChange,
  required = false,
  errors = {},
  countryOptions = DEFAULT_COUNTRIES,
  className = '',
}: FormOrganisationAddressProps) {
  const [addressLine1, setAddressLine1] = React.useState(values.addressLine1 ?? '');
  const [addressLine2, setAddressLine2] = React.useState(values.addressLine2 ?? '');
  const [suburb, setSuburb] = React.useState(values.suburb ?? '');
  const [city, setCity] = React.useState(values.city ?? '');
  const [state, setState] = React.useState(values.state ?? '');
  const [country, setCountry] = React.useState(values.country ?? 'australia');
  const [postcode, setPostcode] = React.useState(values.postcode ?? '');

  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;

  React.useEffect(() => {
    onChangeRef.current?.({
      addressLine1,
      addressLine2,
      suburb,
      city,
      state,
      country,
      postcode,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onChange excluded to prevent infinite loop when parent passes new callback each render
  }, [addressLine1, addressLine2, suburb, city, state, country, postcode]);

  React.useEffect(() => {
    if (Object.keys(values).length > 0) {
      if (values.addressLine1 !== undefined) setAddressLine1(values.addressLine1);
      if (values.addressLine2 !== undefined) setAddressLine2(values.addressLine2);
      if (values.suburb !== undefined) setSuburb(values.suburb);
      if (values.city !== undefined) setCity(values.city);
      if (values.state !== undefined) setState(values.state);
      if (values.country !== undefined) setCountry(values.country);
      if (values.postcode !== undefined) setPostcode(values.postcode);
    }
  }, [
    values.addressLine1,
    values.addressLine2,
    values.suburb,
    values.city,
    values.state,
    values.country,
    values.postcode,
  ]);

  const prefix = (field: string) =>
    namePrefix ? `${namePrefix}.${addressType}.${field}` : `${addressType}.${field}`;

  return (
    <div className={`space-y-5 ${className}`}>
      <FormInput
        id={prefix('addressLine1')}
        name={prefix('addressLine1')}
        label="Address Line 1"
        placeholder="House number and street name"
        value={addressLine1}
        onChange={(e) => setAddressLine1(e.target.value)}
        required={required}
        error={errors.addressLine1}
        state={errors.addressLine1 ? 'error' : 'default'}
      />
      <FormInput
        id={prefix('addressLine2')}
        name={prefix('addressLine2')}
        label="Address Line 2"
        placeholder="Apartment, suite, unit, etc. (optional)"
        value={addressLine2}
        onChange={(e) => setAddressLine2(e.target.value)}
      />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <FormInput
          id={prefix('suburb')}
          name={prefix('suburb')}
          label="Suburb"
          placeholder="Suburb"
          value={suburb}
          onChange={(e) => setSuburb(e.target.value)}
          required={required}
          error={errors.suburb}
          state={errors.suburb ? 'error' : 'default'}
        />
        <FormInput
          id={prefix('city')}
          name={prefix('city')}
          label="City"
          placeholder="City"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          required={required}
          error={errors.city}
          state={errors.city ? 'error' : 'default'}
        />
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <FormInput
          id={prefix('state')}
          name={prefix('state')}
          label="State"
          placeholder="State / Province"
          value={state}
          onChange={(e) => setState(e.target.value)}
          required={required}
          error={errors.state}
          state={errors.state ? 'error' : 'default'}
        />
        <FormInput
          id={prefix('postcode')}
          name={prefix('postcode')}
          label="Postcode"
          placeholder="Postal / ZIP code"
          value={postcode}
          onChange={(e) => setPostcode(e.target.value)}
          required={required}
          error={errors.postcode}
          state={errors.postcode ? 'error' : 'default'}
        />
      </div>
      <FormSelect
        id={prefix('country')}
        name={prefix('country')}
        label="Country"
        placeholder="Select your country"
        options={countryOptions}
        value={country}
        onChange={setCountry}
        required={required}
        error={errors.country}
        state={errors.country ? 'error' : 'default'}
      />
    </div>
  );
}
