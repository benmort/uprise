'use client';

import * as React from 'react';
import {
  FormSectionCard,
  FormInput,
  FormSelect,
  FormToggle,
} from '@/components/prog/shared/forms';
import { TenantFormValues } from '../types';
import { Building2, Shield } from 'lucide-react';

const DEFAULT_ORGANISATION_ROLE_OPTIONS = [
  { value: 'member', label: 'Member' },
  { value: 'admin', label: 'Admin' },
  { value: 'viewer', label: 'Viewer' },
];

export interface TenantFormProps {
  values: Partial<TenantFormValues>;
  onChange: (values: TenantFormValues) => void;
  errors?: Partial<Record<keyof TenantFormValues, string>>;
  disabled?: boolean;
}

export function TenantForm({ values, onChange, errors = {}, disabled }: TenantFormProps) {
  const handleChange = <K extends keyof TenantFormValues>(field: K) => (value: TenantFormValues[K]) => {
    onChange({ ...values, [field]: value } as TenantFormValues);
  };

  return (
    <>
      <FormSectionCard
        title="Tenant"
        description="Tenant basic information"
        icon={<Building2 className="h-5 w-5 text-gray-500 dark:text-gray-400" />}
      >
        <FormInput
          label="Subdomain"
          value={values.subdomain ?? ''}
          placeholder="Subdomain"
          disabled
          state="disabled"
        />
        <p className="text-sm text-gray-500 dark:text-gray-400 -mt-1">
          Subdomain cannot be changed after creation
        </p>
        <FormInput
          label="Display Name"
          value={values.displayName ?? ''}
          onChange={(e) => handleChange('displayName')(e.target.value)}
          placeholder="Enter tenant display name"
          error={errors.displayName}
          disabled={disabled}
        />
      </FormSectionCard>

      <FormSectionCard
        title="Access Control"
        description="Configure member invitations and organisation access"
        icon={<Shield className="h-5 w-5 text-gray-500 dark:text-gray-400" />}
      >
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Allow Member Invitations</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Allow team members to invite new users</p>
            </div>
            <FormToggle
              id="allowMemberInvitations"
              label=""
              checked={values.allowMemberInvitations ?? true}
              onChange={(v) => handleChange('allowMemberInvitations')(v)}
              disabled={disabled}
              variant="brand"
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Allow Organisation Creation</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Allow users to create new organisations within this tenant</p>
            </div>
            <FormToggle
              id="allowOrganisationCreation"
              label=""
              checked={values.allowOrganisationCreation ?? true}
              onChange={(v) => handleChange('allowOrganisationCreation')(v)}
              disabled={disabled}
              variant="brand"
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Require Email Verification</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Require email verification for new user registrations</p>
            </div>
            <FormToggle
              id="requireEmailVerification"
              label=""
              checked={values.requireEmailVerification ?? true}
              onChange={(v) => handleChange('requireEmailVerification')(v)}
              disabled={disabled}
              variant="brand"
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Allow Cross-Organisation Access</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Allow users to access data across different organisations</p>
            </div>
            <FormToggle
              id="allowCrossOrganisationAccess"
              label=""
              checked={values.allowCrossOrganisationAccess ?? false}
              onChange={(v) => handleChange('allowCrossOrganisationAccess')(v)}
              disabled={disabled}
              variant="brand"
            />
          </div>
          <FormSelect
            label="Default Organisation Role"
            options={DEFAULT_ORGANISATION_ROLE_OPTIONS}
            value={values.defaultOrganisationRole ?? 'member'}
            onChange={(v) => handleChange('defaultOrganisationRole')(v)}
            placeholder="Select role"
          />
          <FormInput
            label="Invitation Expiry (Days)"
            type="number"
            value={String(values.invitationExpiryDays ?? 7)}
            onChange={(e) => handleChange('invitationExpiryDays')(parseInt(e.target.value, 10) || 7)}
            error={errors.invitationExpiryDays}
            state={errors.invitationExpiryDays ? 'error' : 'default'}
            disabled={disabled}
          />
          <FormInput
            label="Maximum Organisations per Tenant"
            type="number"
            value={String(values.maxOrganisationsPerTenant ?? 10)}
            onChange={(e) => handleChange('maxOrganisationsPerTenant')(parseInt(e.target.value, 10) || 10)}
            error={errors.maxOrganisationsPerTenant}
            state={errors.maxOrganisationsPerTenant ? 'error' : 'default'}
            disabled={disabled}
          />
        </div>
      </FormSectionCard>
    </>
  );
}
