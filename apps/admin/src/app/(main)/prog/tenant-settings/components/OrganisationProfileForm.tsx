'use client';

import * as React from 'react';
import {
  FormSectionCard,
  FormInput,
  FormTextarea,
} from '@/components/prog/shared/forms';
import { OrganisationProfileFormValues } from '../types';
import { Globe, Image, Palette, Code, Lock } from 'lucide-react';
import { useFlag } from '@/components/flags/flags-provider';

export interface OrganisationProfileFormProps {
  values: Partial<OrganisationProfileFormValues>;
  onChange: (values: OrganisationProfileFormValues) => void;
  errors?: Partial<Record<keyof OrganisationProfileFormValues, string>>;
  disabled?: boolean;
}

export function OrganisationProfileForm({ values, onChange, errors = {}, disabled }: OrganisationProfileFormProps) {
  // Per-tenant branding + white-label styling is a multi-brand entitlement (Scale plan).
  const canMultibrand = useFlag('FEATURE_MULTIBRAND_ENABLED');
  const handleChange = (field: keyof OrganisationProfileFormValues) => (value: string) => {
    onChange({ ...values, [field]: value } as OrganisationProfileFormValues);
  };

  return (
    <>
      <FormSectionCard
        title="Profile & Social"
        description="Bio, website and social media links"
        icon={<Globe className="h-5 w-5 text-gray-500 dark:text-gray-400" />}
      >
        <FormTextarea
          label="Bio"
          value={values.bio ?? ''}
          onChange={(e) => handleChange('bio')(e.target.value)}
          placeholder="Tell us about your organisation"
          rows={3}
          disabled={disabled}
        />
        <FormInput
          label="Website URL"
          type="url"
          value={values.websiteUrl ?? ''}
          onChange={(e) => handleChange('websiteUrl')(e.target.value)}
          placeholder="https://yourwebsite.com"
          disabled={disabled}
        />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <FormInput
            label="Facebook"
            value={values.facebookUrl ?? ''}
            onChange={(e) => handleChange('facebookUrl')(e.target.value)}
            placeholder="Facebook URL"
            disabled={disabled}
          />
          <FormInput
            label="Twitter"
            value={values.twitterUrl ?? ''}
            onChange={(e) => handleChange('twitterUrl')(e.target.value)}
            placeholder="Twitter URL"
            disabled={disabled}
          />
          <FormInput
            label="LinkedIn"
            value={values.linkedinUrl ?? ''}
            onChange={(e) => handleChange('linkedinUrl')(e.target.value)}
            placeholder="LinkedIn URL"
            disabled={disabled}
          />
          <FormInput
            label="Instagram"
            value={values.instagramUrl ?? ''}
            onChange={(e) => handleChange('instagramUrl')(e.target.value)}
            placeholder="Instagram URL"
            disabled={disabled}
          />
        </div>
      </FormSectionCard>

      <FormSectionCard
        title="Organisation Images"
        description="Logo and hero images"
        icon={<Image className="h-5 w-5 text-gray-500 dark:text-gray-400" />}
      >
        <FormInput
          label="Logo Image URL"
          value={values.logoUrl ?? ''}
          onChange={(e) => handleChange('logoUrl')(e.target.value)}
          placeholder="https://example.com/logo.png"
          disabled={disabled}
        />
        <FormInput
          label="Hero Image URL"
          value={values.heroImageUrl ?? ''}
          onChange={(e) => handleChange('heroImageUrl')(e.target.value)}
          placeholder="https://example.com/hero.jpg"
          disabled={disabled}
        />
      </FormSectionCard>

      {canMultibrand ? (
        <>
      <FormSectionCard
        title="Branding"
        description="Primary and secondary colours"
        icon={<Palette className="h-5 w-5 text-gray-500 dark:text-gray-400" />}
      >
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Primary Colour</p>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={values.primaryColor ?? '#3B82F6'}
                onChange={(e) => handleChange('primaryColor')(e.target.value)}
                className="h-10 w-20 cursor-pointer rounded border border-gray-300 dark:border-gray-600 p-1"
                disabled={disabled}
              />
              <FormInput
                label="Primary colour hex"
                value={values.primaryColor ?? '#3B82F6'}
                onChange={(e) => handleChange('primaryColor')(e.target.value)}
                placeholder="#3B82F6"
                disabled={disabled}
              />
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Secondary Colour</p>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={values.secondaryColor ?? '#6366F1'}
                onChange={(e) => handleChange('secondaryColor')(e.target.value)}
                className="h-10 w-20 cursor-pointer rounded border border-gray-300 dark:border-gray-600 p-1"
                disabled={disabled}
              />
              <FormInput
                label="Secondary colour hex"
                value={values.secondaryColor ?? '#6366F1'}
                onChange={(e) => handleChange('secondaryColor')(e.target.value)}
                placeholder="#6366F1"
                disabled={disabled}
              />
            </div>
          </div>
        </div>
      </FormSectionCard>

      <FormSectionCard
        title="Custom Styling"
        description="Custom CSS for white-labeling"
        icon={<Code className="h-5 w-5 text-gray-500 dark:text-gray-400" />}
      >
        <FormTextarea
          label="Custom CSS"
          value={values.customCss ?? ''}
          onChange={(e) => handleChange('customCss')(e.target.value)}
          placeholder="/* Add custom CSS here */"
          rows={6}
          disabled={disabled}
          className="font-mono text-sm"
        />
      </FormSectionCard>
        </>
      ) : (
        <FormSectionCard
          title="Branding & white-label"
          description="Custom colours and CSS for your portal"
          icon={<Lock className="h-5 w-5 text-gray-500 dark:text-gray-400" />}
        >
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Per-tenant branding and white-label styling are part of multi-tenant &amp; multi-brand,
            available on the Scale plan.
          </p>
        </FormSectionCard>
      )}
    </>
  );
}
