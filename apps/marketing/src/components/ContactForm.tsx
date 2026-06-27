'use client';

import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { z } from 'zod';
import { marketing } from '@uprise/api-client';
import { FormInput, FormTextarea, FormLabel, Alert } from '@uprise/ui';

const contactSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().min(1, 'Email is required').email('Please enter a valid email address'),
  company: z.string().optional(),
  subject: z.string().optional(),
  message: z.string().min(1, 'Message is required'),
});

type ContactFormData = z.infer<typeof contactSchema>;

const initialData: ContactFormData = {
  name: '',
  email: '',
  company: '',
  subject: '',
  message: '',
};

export default function ContactForm() {
  const [formData, setFormData] = useState<ContactFormData>(initialData);
  const [errors, setErrors] = useState<Partial<Record<keyof ContactFormData, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof ContactFormData, boolean>>>({});
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    const nextFormData = { ...formData, [name]: value };
    setFormData(nextFormData);
    if (hasAttemptedSubmit) {
      const result = contactSchema.safeParse(nextFormData);
      if (!result.success) {
        const fieldErrors = result.error.flatten().fieldErrors;
        const errMap: Partial<Record<keyof ContactFormData, string>> = {};
        for (const [k, v] of Object.entries(fieldErrors)) {
          if (v?.[0]) errMap[k as keyof ContactFormData] = v[0];
        }
        setErrors(errMap);
      } else {
        setErrors({});
      }
    }
  };

  const handleBlur = (field: keyof ContactFormData) => {
    if (!hasAttemptedSubmit) return;
    setTouched((prev) => ({ ...prev, [field]: true }));
    const result = contactSchema.safeParse(formData);
    if (!result.success) {
      const fieldError = result.error.flatten().fieldErrors[field]?.[0];
      if (fieldError) {
        setErrors((prev) => ({ ...prev, [field]: fieldError }));
      }
    }
  };

  const validate = (): boolean => {
    const result = contactSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      const errMap: Partial<Record<keyof ContactFormData, string>> = {};
      for (const [k, v] of Object.entries(fieldErrors)) {
        if (v?.[0]) errMap[k as keyof ContactFormData] = v[0];
      }
      setErrors(errMap);
      setTouched(
        Object.fromEntries(
          (Object.keys(formData) as (keyof ContactFormData)[]).map((k) => [k, true])
        ) as Partial<Record<keyof ContactFormData, boolean>>
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
      const res = await marketing.contact({
        name: formData.name,
        email: formData.email,
        company: formData.company,
        subject: formData.subject,
        message: formData.message,
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
      console.error('Error submitting contact form:', error);
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
              Name
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

        <div>
          <FormLabel htmlFor="company">Company</FormLabel>
          <FormInput
            type="text"
            name="company"
            id="company"
            value={formData.company ?? ''}
            onChange={handleInputChange}
          />
        </div>

        <div>
          <FormLabel htmlFor="subject">Subject</FormLabel>
          <FormInput
            type="text"
            name="subject"
            id="subject"
            value={formData.subject ?? ''}
            onChange={handleInputChange}
          />
        </div>

        <div>
          <FormLabel htmlFor="message" required>
            Message
          </FormLabel>
          <FormTextarea
            name="message"
            id="message"
            rows={4}
            value={formData.message}
            onChange={handleInputChange}
            onBlur={() => handleBlur('message')}
            error={!!errors.message}
            hint={errors.message}
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
                Sending...
              </>
            ) : (
              'Send Message'
            )}
          </button>
        </div>

        {submitStatus === 'success' && (
          <Alert
            variant="success"
            title="Thanks for contacting us"
            message="We've received your message and will get back to you soon."
          />
        )}

        {submitStatus === 'error' && (
          <Alert
            variant="error"
            title="Something went wrong"
            message="Sorry, there was an error sending your message. Please try again."
          />
        )}
      </form>
    </div>
  );
}
