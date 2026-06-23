'use client';

import * as React from 'react';
import {
  FormSectionCard,
  FormInput,
  FormTextarea,
} from '@/components/prog/shared/forms';
import { OrganisationFormValues } from '../types';
import { Building2 } from 'lucide-react';

export interface OrganisationFormProps {
  values: Partial<OrganisationFormValues>;
  onChange: (values: OrganisationFormValues) => void;
  errors?: Partial<Record<keyof OrganisationFormValues, string>>;
  disabled?: boolean;
}

export function OrganisationForm({ values, onChange, errors = {}, disabled }: OrganisationFormProps) {
  const handleChange = (field: keyof OrganisationFormValues) => (
    value: string
  ) => {
    onChange({ ...values, [field]: value } as OrganisationFormValues);
  };

  return (
    <FormSectionCard
      title="Organisation"
      description="Basic organisation information"
      icon={<Building2 className="h-5 w-5 text-gray-500 dark:text-gray-400" />}
    >
      <FormInput
        label="Organisation Name"
        value={values.name ?? ''}
        onChange={(e) => handleChange('name')(e.target.value)}
        placeholder="Enter organisation name"
        error={errors.name}
        disabled={disabled}
      />
      <FormTextarea
        label="Description"
        value={values.description ?? ''}
        onChange={(e) => handleChange('description')(e.target.value)}
        placeholder="Enter organisation description"
        rows={4}
        disabled={disabled}
      />
    </FormSectionCard>
  );
}
