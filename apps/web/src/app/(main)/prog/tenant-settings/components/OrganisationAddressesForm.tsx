'use client';

import * as React from 'react';
import {
  FormSectionCard,
  FormOrganisationAddress,
  type OrganisationAddressFormValues as SingleAddressValues,
} from '@/components/prog/shared/forms';
import { OrganisationAddressFormValues } from '../types';
import { MapPin } from 'lucide-react';

const DEFAULT_ADDRESS = {
  addressLine1: '',
  addressLine2: '',
  suburb: '',
  city: '',
  state: '',
  country: 'australia',
  postcode: '',
};

import type { AddressErrors } from '../validation/addresses-validation';

export interface OrganisationAddressesFormProps {
  values: Partial<OrganisationAddressFormValues>;
  onChange: (values: OrganisationAddressFormValues) => void;
  errors?: { registered?: AddressErrors; billing?: AddressErrors };
  disabled?: boolean;
  /** When true, show green check in card header (step complete). */
  completed?: boolean;
}

export function OrganisationAddressesForm({ values, onChange, errors = {}, disabled, completed }: OrganisationAddressesFormProps) {
  const billingSameAsRegistered = values.billingSameAsRegistered ?? true;

  const handleRegisteredChange = (v: SingleAddressValues) => {
    const next: OrganisationAddressFormValues = {
      ...values,
      registered: v,
      billing: values.billing ?? DEFAULT_ADDRESS,
    };
    if (billingSameAsRegistered) {
      next.billing = { ...v };
    }
    onChange(next);
  };

  const handleBillingChange = (v: SingleAddressValues) => {
    const next: OrganisationAddressFormValues = {
      ...values,
      billing: v,
      registered: values.registered ?? DEFAULT_ADDRESS,
    };
    onChange(next);
  };

  const handleBillingSameAsToggle = React.useCallback(
    (checked: boolean) => {
      if (checked) {
        const registered = values.registered ?? DEFAULT_ADDRESS;
        onChange({
          ...values,
          billingSameAsRegistered: true,
          billing: { ...registered },
          registered,
        } as OrganisationAddressFormValues);
      } else {
        onChange({
          ...values,
          billingSameAsRegistered: false,
          billing: values.billing ?? DEFAULT_ADDRESS,
          registered: values.registered ?? DEFAULT_ADDRESS,
        } as OrganisationAddressFormValues);
      }
    },
    [values, onChange]
  );

  return (
    <div className="space-y-6">
      <FormSectionCard
        title="Registered Address"
        description="Official registered business address"
        icon={<MapPin className="h-5 w-5 text-gray-500 dark:text-gray-400" />}
        completed={completed}
      >
        <FormOrganisationAddress
          addressType="registered"
          namePrefix="addresses"
          values={values.registered}
          onChange={handleRegisteredChange}
          required
          errors={errors.registered}
        />
      </FormSectionCard>

      <FormSectionCard
        title="Billing Address"
        description="Address used for invoicing"
        icon={<MapPin className="h-5 w-5 text-gray-500 dark:text-gray-400" />}
        completed={completed}
      >
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-4" role="group" aria-label="Billing address options">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Same as registered address</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Use the registered address for billing</p>
            </div>
            <label className="flex shrink-0 cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={billingSameAsRegistered}
                disabled={disabled}
                onChange={(e) => handleBillingSameAsToggle(e.target.checked)}
                className="sr-only"
              />
              <span
                role="switch"
                aria-checked={billingSameAsRegistered}
                className={`relative inline-block h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
                  disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                } ${billingSameAsRegistered ? 'bg-brand-500' : 'bg-gray-200 dark:bg-white/10'}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                    billingSameAsRegistered ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </span>
            </label>
          </div>
          {!billingSameAsRegistered && (
            <FormOrganisationAddress
              addressType="billing"
              namePrefix="addresses"
              values={values.billing}
              onChange={handleBillingChange}
              required
              errors={errors.billing}
            />
          )}
        </div>
      </FormSectionCard>
    </div>
  );
}
