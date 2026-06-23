'use client';

import * as React from 'react';
import {
  FormSectionCard,
  FormInput,
  FormSelect,
  FormToggle,
} from '@/components/prog/shared/forms';
import { OrganisationCredentialsFormValues, OrganisationIdentifierType } from '../types';
import { FileText } from 'lucide-react';

// Legal structure – how the organisation is registered
const ENTITY_TYPE_OPTIONS = [
  { value: 'charity', label: 'Charity' },
  { value: 'incorporated_association', label: 'Incorporated Association' },
  { value: 'company_limited_by_guarantee', label: 'Company Limited by Guarantee' },
  { value: 'trust', label: 'Trust' },
  { value: 'unincorporated_association', label: 'Unincorporated Association' },
  { value: 'cooperative', label: 'Co-operative' },
  { value: 'political_party', label: 'Political Party' },
  { value: 'atsi_corporation', label: 'Aboriginal and Torres Strait Islander Corporation' },
  { value: 'other', label: 'Other' },
];

// Entity types that have an ACN (Australian companies)
const ENTITY_TYPES_WITH_ACN = ['company', 'company_limited_by_guarantee'];

// Sector/domain – what the organisation does (distinct from legal structure)
const INDUSTRY_OPTIONS = [
  { value: 'environmental', label: 'Environmental & Conservation' },
  { value: 'health', label: 'Health & Medical' },
  { value: 'education', label: 'Education & Training' },
  { value: 'arts_culture', label: 'Arts & Culture' },
  { value: 'social_services', label: 'Social Services & Welfare' },
  { value: 'human_rights', label: 'Human Rights & Advocacy' },
  { value: 'animal_welfare', label: 'Animal Welfare' },
  { value: 'international_development', label: 'International Development' },
  { value: 'religious', label: 'Religious' },
  { value: 'sports_recreation', label: 'Sports & Recreation' },
  { value: 'community_development', label: 'Community Development' },
  { value: 'research_science', label: 'Research & Science' },
  { value: 'philanthropy', label: 'Philanthropy & Grantmaking' },
  { value: 'political_party', label: 'Political Party' },
  { value: 'associated_entity', label: 'Associated Entity (Political)' },
  { value: 'peak_body', label: 'Peak Body / Umbrella Organisation' },
  { value: 'other', label: 'Other' },
];

export interface OrganisationCredentialsFormProps {
  values: Partial<OrganisationCredentialsFormValues>;
  onChange: (values: OrganisationCredentialsFormValues) => void;
  errors?: Partial<Record<keyof OrganisationCredentialsFormValues, string>>;
  disabled?: boolean;
  /** When true, show green check in card header (step complete). */
  completed?: boolean;
}

export function OrganisationCredentialsForm({ values, onChange, errors = {}, disabled, completed }: OrganisationCredentialsFormProps) {
  const handleChange = <K extends keyof OrganisationCredentialsFormValues>(field: K) => (
    value: OrganisationCredentialsFormValues[K]
  ) => {
    const next = { ...values, [field]: value } as OrganisationCredentialsFormValues;
    // When switching to non-ACN entity type, reset identifier to ABN
    if (field === 'entityType') {
      if (!ENTITY_TYPES_WITH_ACN.includes(String(value))) {
        next.identifierType = 'abn';
      }
      // When switching away from charity, clear charity-specific fields
      if (String(value) !== 'charity') {
        next.acncRegistrationNumber = '';
        next.deductibleGiftRecipient = false;
      }
    }
    onChange(next);
  };

  const identifierType = (values.identifierType ?? 'abn') as OrganisationIdentifierType;
  const entityType = values.entityType ?? '';
  const canUseAcn = ENTITY_TYPES_WITH_ACN.includes(entityType);
  const isCharity = entityType === 'charity';
  const showAcnOption = canUseAcn;
  const showAcnField = showAcnOption && identifierType === 'acn';
  const showAbnField = identifierType === 'abn';

  return (
    <FormSectionCard
      title="Organisation Credentials"
      description="Legal and business registration details"
      icon={<FileText className="h-5 w-5 text-gray-500 dark:text-gray-400" />}
      completed={completed}
    >
      <FormInput
        label="Legal Trading Name"
        value={values.legalTradingName ?? ''}
        onChange={(e) => handleChange('legalTradingName')(e.target.value)}
        placeholder="Legal trading name"
        error={errors.legalTradingName}
        state={errors.legalTradingName ? 'error' : 'default'}
        required
        disabled={disabled}
      />

      <div>
        <FormSelect
          label="Entity Type"
          options={ENTITY_TYPE_OPTIONS}
          value={values.entityType ?? ''}
          onChange={(v) => handleChange('entityType')(v)}
          placeholder="Select legal structure"
          error={errors.entityType}
          required
        />
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Legal structure (how the organisation is registered)
        </p>
      </div>

      <div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Identify organisation by
        </p>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="identifierType"
              checked={identifierType === 'abn'}
              onChange={() => handleChange('identifierType')('abn')}
              disabled={disabled}
              className="h-4 w-4 border-gray-300 text-brand-500 focus:ring-brand-500"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Australian Business Number (ABN)
            </span>
          </label>
          {showAcnOption && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="identifierType"
                checked={identifierType === 'acn'}
                onChange={() => handleChange('identifierType')('acn')}
                disabled={disabled}
                className="h-4 w-4 border-gray-300 text-brand-500 focus:ring-brand-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Australian Company Number (ACN)
              </span>
            </label>
          )}
        </div>
        {showAcnOption && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            ACN is available for Company Limited by Guarantee
          </p>
        )}
      </div>

      {showAbnField && (
        <FormInput
          label="Australian Business Number (ABN)"
          value={values.australianBusinessNumber ?? ''}
          onChange={(e) => handleChange('australianBusinessNumber')(e.target.value)}
          placeholder="e.g. 51 824 753 556"
          error={errors.australianBusinessNumber}
          state={errors.australianBusinessNumber ? 'error' : 'default'}
          required
          disabled={disabled}
        />
      )}

      {showAcnField && (
        <FormInput
          label="Australian Company Number (ACN)"
          value={values.australianCompanyNumber ?? ''}
          onChange={(e) => handleChange('australianCompanyNumber')(e.target.value)}
          placeholder="e.g. 123 456 789"
          error={errors.australianCompanyNumber}
          state={errors.australianCompanyNumber ? 'error' : 'default'}
          required
          disabled={disabled}
        />
      )}

      <div>
        <FormSelect
          label="Sector / Industry"
          options={INDUSTRY_OPTIONS}
          value={values.industry ?? ''}
          onChange={(v) => handleChange('industry')(v)}
          placeholder="Select sector or area of focus"
          error={errors.industry}
          required
        />
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Area of focus (what the organisation does)
        </p>
      </div>

      <FormInput
        label="Tax File Number (TFN)"
        value={values.taxFileNumber ?? ''}
        onChange={(e) => handleChange('taxFileNumber')(e.target.value)}
        placeholder="8 or 9 digits (optional)"
        error={errors.taxFileNumber}
        state={errors.taxFileNumber ? 'error' : 'default'}
        disabled={disabled}
      />

      {isCharity && (
        <>
          <FormInput
            label="ACNC Registration Number"
            value={values.acncRegistrationNumber ?? ''}
            onChange={(e) => handleChange('acncRegistrationNumber')(e.target.value)}
            placeholder="e.g. ABC123 (optional)"
            error={errors.acncRegistrationNumber}
            state={errors.acncRegistrationNumber ? 'error' : 'default'}
            disabled={disabled}
          />

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Deductible Gift Recipient</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Organisation is a deductible gift recipient</p>
            </div>
            <FormToggle
              id="deductibleGiftRecipient"
              label=""
              checked={values.deductibleGiftRecipient ?? false}
              onChange={(v) => handleChange('deductibleGiftRecipient')(v)}
              disabled={disabled}
              variant="brand"
            />
          </div>
        </>
      )}
    </FormSectionCard>
  );
}
