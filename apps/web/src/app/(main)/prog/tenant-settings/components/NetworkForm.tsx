'use client';

import * as React from 'react';
import {
  FormSectionCard,
  FormInput,
} from '@/components/prog/shared/forms';
import { NetworkFormValues } from '../types';
import { Globe } from 'lucide-react';

export interface NetworkFormProps {
  values: Partial<NetworkFormValues>;
  onChange: (values: NetworkFormValues) => void;
  errors?: Partial<Record<keyof NetworkFormValues, string>>;
  disabled?: boolean;
}

export function NetworkForm({ values, onChange, errors = {}, disabled }: NetworkFormProps) {
  const handleChange = (field: keyof NetworkFormValues) => (value: string) => {
    onChange({ ...values, [field]: value } as NetworkFormValues);
  };

  return (
    <FormSectionCard
      title="Network"
      description="Network-level settings and plan information"
      icon={<Globe className="h-5 w-5 text-gray-500 dark:text-gray-400" />}
    >
      <FormInput
        label="Network Name"
        value={values.name ?? ''}
        onChange={(e) => handleChange('name')(e.target.value)}
        placeholder="Enter network name"
        error={errors.name}
        disabled={disabled}
      />
      <FormInput
        label="Plan"
        value={values.planName ?? ''}
        onChange={(e) => handleChange('planName')(e.target.value)}
        placeholder="Plan name"
        disabled
        state="disabled"
      />
      <FormInput
        label="Subscription Status"
        value={values.subscriptionStatus ?? ''}
        onChange={(e) => handleChange('subscriptionStatus')(e.target.value)}
        placeholder="Subscription status"
        disabled
        state="disabled"
      />
    </FormSectionCard>
  );
}
