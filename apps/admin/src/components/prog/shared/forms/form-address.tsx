'use client';

import * as React from 'react';
import { FormInput } from './form-input';
import { FormSelect, type FormSelectOption } from './form-select';

export interface AddressFormValues {
  street: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
}

export interface AddressFormProps {
  /** Optional field name prefix for form submission (e.g. "billing.address") */
  namePrefix?: string;
  /** Controlled values */
  values?: Partial<AddressFormValues>;
  /** Change handler for controlled mode */
  onChange?: (values: AddressFormValues) => void;
  /** Whether all fields are required */
  required?: boolean;
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

export function FormAddress({
  namePrefix = 'address',
  values = {},
  onChange,
  required = false,
  countryOptions = DEFAULT_COUNTRIES,
  className = '',
}: AddressFormProps) {
  const [street, setStreet] = React.useState(values.street ?? '');
  const [city, setCity] = React.useState(values.city ?? '');
  const [state, setState] = React.useState(values.state ?? '');
  const [country, setCountry] = React.useState(values.country ?? 'australia');
  const [postalCode, setPostalCode] = React.useState(values.postalCode ?? '');

  React.useEffect(() => {
    if (onChange) {
      onChange({ street, city, state, country, postalCode });
    }
  }, [street, city, state, country, postalCode, onChange]);

  React.useEffect(() => {
    if (Object.keys(values).length > 0) {
      if (values.street !== undefined) setStreet(values.street);
      if (values.city !== undefined) setCity(values.city);
      if (values.state !== undefined) setState(values.state);
      if (values.country !== undefined) setCountry(values.country);
      if (values.postalCode !== undefined) setPostalCode(values.postalCode);
    }
  }, [values.street, values.city, values.state, values.country, values.postalCode]);

  const prefix = (field: string) => (namePrefix ? `${namePrefix}.${field}` : field);

  return (
    <div className={`space-y-5 ${className}`}>
      <FormInput
        id={prefix('street')}
        name={prefix('street')}
        label="Street Address"
        placeholder="House number and street name"
        value={street}
        onChange={(e) => setStreet(e.target.value)}
        required={required}
      />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <FormInput
          id={prefix('city')}
          name={prefix('city')}
          label="City"
          placeholder="City"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          required={required}
        />
        <FormInput
          id={prefix('state')}
          name={prefix('state')}
          label="State"
          placeholder="State / Province"
          value={state}
          onChange={(e) => setState(e.target.value)}
          required={required}
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
      />
      <FormInput
        id={prefix('postalCode')}
        name={prefix('postalCode')}
        label="Postal code"
        placeholder="Postal / ZIP code"
        value={postalCode}
        onChange={(e) => setPostalCode(e.target.value)}
        required={required}
      />
    </div>
  );
}
