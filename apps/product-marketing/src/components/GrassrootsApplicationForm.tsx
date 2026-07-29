'use client';

/**
 * Grassroots philanthropic-licence application.
 *
 * Submits through `marketing.contact` rather than `demoRequest`: contact carries an explicit
 * `subject`, so applications land in the same inbox labelled "Grassroots licence application"
 * instead of masquerading as a demo request. That avoids a new backend endpoint for what is a
 * structured email — the fields below are composed into the message body.
 */

import React, { useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { z } from 'zod';
import { marketing } from '@uprise/api-client';
import {
  Alert,
  FormInput,
  FormLabel,
  FormSelect,
  FormTextarea,
  TurnstileWidget,
  type TurnstileHandle,
} from '@uprise/ui';

const SUBJECT = 'Grassroots licence application';

const SIZE_OPTIONS = [
  { value: 'volunteer-only', label: 'Volunteer-run, no paid staff' },
  { value: '1-3', label: '1–3 paid staff' },
  { value: '4-10', label: '4–10 paid staff' },
  { value: '11-25', label: '11–25 paid staff' },
  { value: '25-plus', label: 'More than 25 paid staff' },
];

const FOCUS_OPTIONS = [
  { value: 'climate', label: 'Climate & environment' },
  { value: 'first-nations', label: 'First Nations justice' },
  { value: 'democracy', label: 'Democracy & electoral reform' },
  { value: 'housing', label: 'Housing & cost of living' },
  { value: 'racial-justice', label: 'Racial justice & migration' },
  { value: 'workers', label: 'Workers & unions' },
  { value: 'health', label: 'Health & disability' },
  { value: 'other', label: 'Something else' },
];

const applicationSchema = z.object({
  name: z.string().min(1, 'Your name is required'),
  email: z.string().min(1, 'Email is required').email('Please enter a valid email address'),
  organisation: z.string().min(1, 'Organisation name is required'),
  website: z.string().optional(),
  size: z.string().min(1, 'Please tell us roughly how big your team is'),
  focus: z.string().min(1, 'Please choose the closest area of work'),
  work: z.string().min(30, 'A couple of sentences, please – at least 30 characters'),
  need: z.string().min(30, 'A couple of sentences, please – at least 30 characters'),
});

type ApplicationData = z.infer<typeof applicationSchema>;

const initialData: ApplicationData = {
  name: '',
  email: '',
  organisation: '',
  website: '',
  size: '',
  focus: '',
  work: '',
  need: '',
};

const labelFor = (options: { value: string; label: string }[], value: string) =>
  options.find((o) => o.value === value)?.label ?? value;

/** Compose the structured answers into the plain-text body the contact endpoint emails on. */
function buildMessage(data: ApplicationData): string {
  return [
    `Organisation: ${data.organisation}`,
    data.website ? `Website: ${data.website}` : null,
    `Team size: ${labelFor(SIZE_OPTIONS, data.size)}`,
    `Area of work: ${labelFor(FOCUS_OPTIONS, data.focus)}`,
    '',
    'What they work on:',
    data.work,
    '',
    'What they need Uprise for:',
    data.need,
  ]
    .filter((line) => line !== null)
    .join('\n');
}

export default function GrassrootsApplicationForm() {
  const [formData, setFormData] = useState<ApplicationData>(initialData);
  const [errors, setErrors] = useState<Partial<Record<keyof ApplicationData, string>>>({});
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const captchaRef = useRef<TurnstileHandle>(null);

  /** Re-validate as they type, but only once they've tried to submit — no scolding up front. */
  const revalidate = (next: ApplicationData) => {
    if (!hasAttemptedSubmit) return;
    const result = applicationSchema.safeParse(next);
    if (result.success) {
      setErrors({});
      return;
    }
    const fieldErrors = result.error.flatten().fieldErrors;
    const errMap: Partial<Record<keyof ApplicationData, string>> = {};
    for (const [k, v] of Object.entries(fieldErrors)) {
      if (v?.[0]) errMap[k as keyof ApplicationData] = v[0];
    }
    setErrors(errMap);
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    const next = { ...formData, [name]: value };
    setFormData(next);
    revalidate(next);
  };

  const validate = (): boolean => {
    const result = applicationSchema.safeParse(formData);
    if (result.success) {
      setErrors({});
      return true;
    }
    const fieldErrors = result.error.flatten().fieldErrors;
    const errMap: Partial<Record<keyof ApplicationData, string>> = {};
    for (const [k, v] of Object.entries(fieldErrors)) {
      if (v?.[0]) errMap[k as keyof ApplicationData] = v[0];
    }
    setErrors(errMap);
    return false;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setHasAttemptedSubmit(true);
    if (!validate()) return;

    setIsSubmitting(true);
    setSubmitStatus('idle');
    try {
      const captchaToken = (await captchaRef.current?.execute()) ?? undefined;
      const res = await marketing.contact(
        {
          name: formData.name,
          email: formData.email,
          company: formData.organisation,
          subject: SUBJECT,
          message: buildMessage(formData),
        },
        captchaToken,
      );
      if (res.ok) {
        setSubmitStatus('success');
        setFormData(initialData);
        setErrors({});
        setHasAttemptedSubmit(false);
      } else {
        setSubmitStatus('error');
      }
    } catch {
      setSubmitStatus('error');
    } finally {
      // No reset needed — TurnstileWidget.execute() mints a fresh token per call.
      setIsSubmitting(false);
    }
  };

  if (submitStatus === 'success') {
    return (
      <div className="rounded-3xl border border-stroke bg-white p-8 text-center md:p-12">
        <h3 className="mb-3 text-2xl font-bold text-title-color">Application received</h3>
        <p className="mx-auto max-w-[480px] text-base text-text-color-secondary">
          Thank you – we read every application ourselves. Expect to hear from a person, not an
          autoresponder, within a few working days.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="rounded-3xl border border-stroke bg-white p-6 md:p-10"
    >
      {submitStatus === 'error' && (
        <div className="mb-6">
          <Alert
            variant="error"
            title="We couldn't send that"
            message="Please try again, or email us directly at contact@upriselabs.org."
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <FormLabel htmlFor="name" required>
            Your name
          </FormLabel>
          <FormInput
            id="name"
            name="name"
            type="text"
            value={formData.name}
            onChange={handleInputChange}
            error={!!errors.name}
            hint={errors.name}
            disabled={isSubmitting}
          />
        </div>
        <div>
          <FormLabel htmlFor="email" required>
            Email
          </FormLabel>
          <FormInput
            id="email"
            name="email"
            type="text"
            value={formData.email}
            onChange={handleInputChange}
            error={!!errors.email}
            hint={errors.email}
            disabled={isSubmitting}
          />
        </div>
        <div>
          <FormLabel htmlFor="organisation" required>
            Organisation
          </FormLabel>
          <FormInput
            id="organisation"
            name="organisation"
            type="text"
            value={formData.organisation}
            onChange={handleInputChange}
            error={!!errors.organisation}
            hint={errors.organisation}
            disabled={isSubmitting}
          />
        </div>
        <div>
          <FormLabel htmlFor="website">Website or social page</FormLabel>
          <FormInput
            id="website"
            name="website"
            type="text"
            placeholder="https://"
            value={formData.website}
            onChange={handleInputChange}
            error={!!errors.website}
            hint={errors.website ?? 'Optional'}
            disabled={isSubmitting}
          />
        </div>
        <div>
          <FormLabel htmlFor="size" required>
            How big is your team?
          </FormLabel>
          <FormSelect
            id="size"
            name="size"
            value={formData.size}
            onChange={handleInputChange}
            options={SIZE_OPTIONS}
            placeholder="Select…"
            error={!!errors.size}
            hint={errors.size}
            disabled={isSubmitting}
          />
        </div>
        <div>
          <FormLabel htmlFor="focus" required>
            Closest area of work
          </FormLabel>
          <FormSelect
            id="focus"
            name="focus"
            value={formData.focus}
            onChange={handleInputChange}
            options={FOCUS_OPTIONS}
            placeholder="Select…"
            error={!!errors.focus}
            hint={errors.focus}
            disabled={isSubmitting}
          />
        </div>
      </div>

      <div className="mt-5">
        <FormLabel htmlFor="work" required>
          What does your organisation work on?
        </FormLabel>
        <FormTextarea
          id="work"
          name="work"
          rows={4}
          placeholder="Tell us what you're trying to change, and who you're organising."
          value={formData.work}
          onChange={handleInputChange}
          error={!!errors.work}
          hint={errors.work}
          disabled={isSubmitting}
        />
      </div>

      <div className="mt-5">
        <FormLabel htmlFor="need" required>
          What would Uprise let you do that you can&apos;t today?
        </FormLabel>
        <FormTextarea
          id="need"
          name="need"
          rows={4}
          placeholder="Spreadsheets you're outgrowing, a list you can't reach, doorknocking you're tracking on paper – whatever it is."
          value={formData.need}
          onChange={handleInputChange}
          error={!!errors.need}
          hint={errors.need}
          disabled={isSubmitting}
        />
      </div>

      <TurnstileWidget ref={captchaRef} />

      <div className="mt-7 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-6 py-3.5 text-base font-medium text-white duration-200 hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {isSubmitting ? 'Sending…' : 'Send application'}
        </button>
        <p className="text-sm text-text-color-tertiary">
          No cost, no obligation, and no sales call unless you want one.
        </p>
      </div>
    </form>
  );
}
