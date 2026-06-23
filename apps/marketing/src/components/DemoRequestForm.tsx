'use client';

import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { z } from 'zod';
import { marketing } from '@yarns/api-client';
import { FormInput, FormTextarea, FormSelect, FormLabel, Alert } from '@yarns/ui';

const ROLE_OPTIONS = [
  { value: 'campaign-manager', label: 'Campaign Manager' },
  { value: 'organizer', label: 'Organizer' },
  { value: 'volunteer-coordinator', label: 'Volunteer Coordinator' },
  { value: 'communications-director', label: 'Communications Director' },
  { value: 'executive-director', label: 'Executive Director' },
  { value: 'other', label: 'Other' },
];

const USE_CASE_OPTIONS = [
  { value: 'political-campaigns', label: 'Political Campaigns' },
  { value: 'advocacy-movements', label: 'Advocacy Movements' },
  { value: 'nonprofit-fundraising', label: 'Nonprofit Fundraising' },
  { value: 'community-organizing', label: 'Community Organizing' },
  { value: 'volunteer-management', label: 'Volunteer Management' },
  { value: 'event-coordination', label: 'Event Coordination' },
  { value: 'other', label: 'Other' },
];

const TIMELINE_OPTIONS = [
  { value: 'immediately', label: 'Immediately' },
  { value: 'within-1-month', label: 'Within 1 month' },
  { value: 'within-3-months', label: 'Within 3 months' },
  { value: 'within-6-months', label: 'Within 6 months' },
  { value: 'exploring-options', label: 'Just exploring options' },
];

const demoSchema = z.object({
  name: z.string().min(1, 'Full name is required'),
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Please enter a valid email address'),
  company: z.string().min(1, 'Company is required'),
  role: z.string().min(1, 'Please select your role'),
  useCase: z.string().min(1, 'Please select your primary use case'),
  timeline: z.string().min(1, 'Please select your timeline'),
  additionalInfo: z.string().optional(),
});

type DemoFormData = z.infer<typeof demoSchema>;

const initialData: DemoFormData = {
  name: '',
  email: '',
  company: '',
  role: '',
  useCase: '',
  timeline: '',
  additionalInfo: '',
};

export default function DemoRequestForm() {
  const [formData, setFormData] = useState<DemoFormData>(initialData);
  const [errors, setErrors] = useState<Partial<Record<keyof DemoFormData, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof DemoFormData, boolean>>>({});
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    const nextFormData = { ...formData, [name]: value };
    setFormData(nextFormData);
    if (hasAttemptedSubmit) {
      const result = demoSchema.safeParse(nextFormData);
      if (!result.success) {
        const fieldErrors = result.error.flatten().fieldErrors;
        const errMap: Partial<Record<keyof DemoFormData, string>> = {};
        for (const [k, v] of Object.entries(fieldErrors)) {
          if (v?.[0]) errMap[k as keyof DemoFormData] = v[0];
        }
        setErrors(errMap);
      } else {
        setErrors({});
      }
    }
  };

  const handleBlur = (field: keyof DemoFormData) => {
    if (!hasAttemptedSubmit) return;
    setTouched((prev) => ({ ...prev, [field]: true }));
    const result = demoSchema.safeParse(formData);
    if (!result.success) {
      const fieldError = result.error.flatten().fieldErrors[field]?.[0];
      if (fieldError) {
        setErrors((prev) => ({ ...prev, [field]: fieldError }));
      }
    }
  };

  const validate = (): boolean => {
    const result = demoSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      const errMap: Partial<Record<keyof DemoFormData, string>> = {};
      for (const [k, v] of Object.entries(fieldErrors)) {
        if (v?.[0]) errMap[k as keyof DemoFormData] = v[0];
      }
      setErrors(errMap);
      setTouched(
        Object.fromEntries(
          (Object.keys(formData) as (keyof DemoFormData)[]).map((k) => [k, true])
        ) as Partial<Record<keyof DemoFormData, boolean>>
      );
      return false;
    }
    setErrors({});
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setHasAttemptedSubmit(true);
    if (!validate()) return;

    setIsSubmitting(true);
    setSubmitStatus('idle');

    try {
      const res = await marketing.demoRequest({
        name: formData.name,
        email: formData.email,
        company: formData.company,
        role: formData.role,
        useCase: formData.useCase,
        timeline: formData.timeline,
        additionalInfo: formData.additionalInfo,
      });

      if (res.ok) {
        setSubmitStatus('success');
        setFormData(initialData);
        setErrors({});
        setTouched({});
        setHasAttemptedSubmit(false);
      } else {
        setSubmitStatus('error');
      }
    } catch (error) {
      console.error('Error submitting demo request:', error);
      setSubmitStatus('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <FormLabel htmlFor="name" required>
              Full Name
            </FormLabel>
            <FormInput
              type="text"
              name="name"
              id="name"
              value={formData.name}
              onChange={handleInputChange}
              onBlur={() => handleBlur('name')}
              error={!!errors.name}
              hint={errors.name}
            />
          </div>
          <div>
            <FormLabel htmlFor="email" required>
              Email
            </FormLabel>
            <FormInput
              type="text"
              name="email"
              id="email"
              value={formData.email}
              onChange={handleInputChange}
              onBlur={() => handleBlur('email')}
              error={!!errors.email}
              hint={errors.email}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <FormLabel htmlFor="company" required>
              Company
            </FormLabel>
            <FormInput
              type="text"
              name="company"
              id="company"
              value={formData.company}
              onChange={handleInputChange}
              onBlur={() => handleBlur('company')}
              error={!!errors.company}
              hint={errors.company}
            />
          </div>
          <div>
            <FormLabel htmlFor="role" required>
              Role
            </FormLabel>
            <FormSelect
              name="role"
              id="role"
              value={formData.role}
              onChange={handleInputChange}
              onBlur={() => handleBlur('role')}
              options={ROLE_OPTIONS}
              placeholder="Select your role"
              error={!!errors.role}
              hint={errors.role}
            />
          </div>
        </div>

        <div>
          <FormLabel htmlFor="useCase" required>
            Primary Use Case
          </FormLabel>
          <FormSelect
            name="useCase"
            id="useCase"
            value={formData.useCase}
            onChange={handleInputChange}
            onBlur={() => handleBlur('useCase')}
            options={USE_CASE_OPTIONS}
            placeholder="Select your primary use case"
              error={!!errors.useCase}
              hint={errors.useCase}
          />
        </div>

        <div>
          <FormLabel htmlFor="timeline" required>
            Timeline
          </FormLabel>
          <FormSelect
            name="timeline"
            id="timeline"
            value={formData.timeline}
            onChange={handleInputChange}
            onBlur={() => handleBlur('timeline')}
            options={TIMELINE_OPTIONS}
            placeholder="Select your timeline"
              error={!!errors.timeline}
              hint={errors.timeline}
          />
        </div>

        <div>
          <FormLabel htmlFor="additionalInfo">Additional Information</FormLabel>
          <FormTextarea
            name="additionalInfo"
            id="additionalInfo"
            rows={4}
            value={formData.additionalInfo ?? ''}
            onChange={handleInputChange}
            placeholder="Tell us more about your organization and how we can help..."
          />
        </div>

        <div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-brand-500 px-5 py-4 text-base font-medium text-white shadow-theme-xs transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                Requesting Demo...
              </>
            ) : (
              'Request Demo'
            )}
          </button>
        </div>

        {submitStatus === 'success' && (
          <Alert
            variant="success"
            title="Thanks for contacting us"
            message="We've received your demo request and will contact you within 24 hours to schedule your demo."
          />
        )}

        {submitStatus === 'error' && (
          <Alert
            variant="error"
            title="Something went wrong"
            message="Sorry, there was an error submitting your demo request. Please try again."
          />
        )}
      </form>
    </div>
  );
}
