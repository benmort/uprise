'use client';

import * as React from 'react';
import { FormInput } from './form-input';
import { FormSectionCard } from './form-section-card';
import { FormAddress, type AddressFormValues } from './form-address';

export interface BillingDetailsFormValues {
  name: string;
  address: AddressFormValues;
  gstNumber: string;
}

export interface BillingDetailsFormProps {
  /** Optional field name prefix for form submission */
  namePrefix?: string;
  /** Controlled values */
  values?: Partial<BillingDetailsFormValues>;
  /** Change handler for controlled mode */
  onChange?: (values: BillingDetailsFormValues) => void;
  /** Whether all fields are required */
  required?: boolean;
  /** Section card title */
  title?: string;
  /** Additional class for the container */
  className?: string;
  /** When true, render form fields only without FormSectionCard wrapper (e.g. for modals) */
  noCard?: boolean;
}

const defaultAddress: AddressFormValues = {
  street: '',
  city: '',
  state: '',
  country: 'australia',
  postalCode: '',
};

export function FormBillingDetails({
  namePrefix = 'billing',
  values = {},
  onChange,
  required = false,
  title = 'Billing Details',
  className = '',
  noCard = false,
}: BillingDetailsFormProps) {
  const [name, setName] = React.useState(values.name ?? '');
  const [address, setAddress] = React.useState<AddressFormValues>(values.address ?? defaultAddress);
  const [gstNumber, setGstNumber] = React.useState(values.gstNumber ?? '');

  React.useEffect(() => {
    if (onChange) {
      onChange({ name, address, gstNumber });
    }
  }, [name, address, gstNumber, onChange]);

  React.useEffect(() => {
    if (values.name !== undefined) setName(values.name);
    if (values.address !== undefined) setAddress(values.address);
    if (values.gstNumber !== undefined) setGstNumber(values.gstNumber);
  }, [values.name, values.address, values.gstNumber]);

  const formContent = (
    <div className="space-y-5">
      <FormInput
          id={`${namePrefix}.name`}
          name={`${namePrefix}.name`}
          label="Name"
          placeholder="Full name or company name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required={required}
        />

        <FormAddress
          namePrefix={`${namePrefix}.address`}
          values={address}
          onChange={setAddress}
          required={required}
        />

      <FormInput
        id={`${namePrefix}.gstNumber`}
        name={`${namePrefix}.gstNumber`}
        label="GST Number"
        placeholder="GST / VAT number (optional)"
        value={gstNumber}
        onChange={(e) => setGstNumber(e.target.value)}
      />
    </div>
  );

  if (noCard) {
    return <div className={className}>{formContent}</div>;
  }
  return (
    <FormSectionCard title={title} className={className}>
      {formContent}
    </FormSectionCard>
  );
}
