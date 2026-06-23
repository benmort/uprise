'use client';

import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { z } from 'zod';
import { marketing } from '@yarns/api-client';
import { FormInput, FormLabel, Alert } from '@yarns/ui';

const newsletterSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Please enter a valid email address'),
});

type NewsletterFormData = z.infer<typeof newsletterSchema>;

export default function NewsletterSignup() {
  const [formData, setFormData] = useState<NewsletterFormData>({ email: '' });
  const [errors, setErrors] = useState<Partial<Record<keyof NewsletterFormData, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof NewsletterFormData, boolean>>>({});
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const nextFormData = { ...formData, [name]: value };
    setFormData(nextFormData);
    if (hasAttemptedSubmit) {
      const result = newsletterSchema.safeParse(nextFormData);
      if (!result.success) {
        const fieldErrors = result.error.flatten().fieldErrors;
        const errMap: Partial<Record<keyof NewsletterFormData, string>> = {};
        for (const [k, v] of Object.entries(fieldErrors)) {
          if (v?.[0]) errMap[k as keyof NewsletterFormData] = v[0];
        }
        setErrors(errMap);
      } else {
        setErrors({});
      }
    }
  };

  const handleBlur = (field: keyof NewsletterFormData) => {
    if (!hasAttemptedSubmit) return;
    setTouched((prev) => ({ ...prev, [field]: true }));
    const result = newsletterSchema.safeParse(formData);
    if (!result.success) {
      const fieldError = result.error.flatten().fieldErrors[field]?.[0];
      if (fieldError) setErrors((prev) => ({ ...prev, [field]: fieldError }));
    }
  };

  const validate = (): boolean => {
    const result = newsletterSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      const errMap: Partial<Record<keyof NewsletterFormData, string>> = {};
      for (const [k, v] of Object.entries(fieldErrors)) {
        if (v?.[0]) errMap[k as keyof NewsletterFormData] = v[0];
      }
      setErrors(errMap);
      setTouched({ email: true });
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
      const res = await marketing.newsletter(formData.email);

      if (res.ok) {
        setSubmitStatus('success');
        setFormData({ email: '' });
        setErrors({});
        setTouched({});
        setHasAttemptedSubmit(false);
      } else {
        setSubmitStatus('error');
      }
    } catch (error) {
      console.error('Error signing up for newsletter:', error);
      setSubmitStatus('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-md text-left">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div className="flex gap-2">
          <div className="flex-1 min-w-0">
            <FormLabel htmlFor="newsletter-email" required className="sr-only">
              Email
            </FormLabel>
            <FormInput
              type="email"
              name="email"
              id="newsletter-email"
              value={formData.email}
              onChange={handleInputChange}
              onBlur={() => handleBlur('email')}
              placeholder="Enter your email"
              error={!!errors.email}
              hint={errors.email}
            />
          </div>
          <button
            type="submit"
            aria-label="Subscribe to newsletter"
            disabled={isSubmitting}
            className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-primary text-white duration-200 hover:bg-primary-600 focus:border-primary-300 focus:shadow-focused disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            ) : (
              <svg className="h-6 w-6" viewBox="0 0 25 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path fillRule="evenodd" clipRule="evenodd" d="M6.17642 2.73695C4.30494 1.86444 2.34486 3.76276 3.15704 5.66121L5.7427 11.7051C5.8233 11.8935 5.8233 12.1067 5.7427 12.2951L3.15704 18.3391C2.34486 20.2375 4.30494 22.1358 6.17642 21.2633L21.6712 14.0394C23.4035 13.2317 23.4035 10.7685 21.6712 9.96087L6.17642 2.73695ZM4.53613 5.07121C4.26541 4.4384 4.91877 3.80562 5.54259 4.09646L21.0374 11.3204C21.6148 11.5896 21.6148 12.4107 21.0374 12.6799L5.5426 19.9038C4.91877 20.1946 4.26541 19.5619 4.53613 18.9291L7.12179 12.8851C7.14136 12.8394 7.15935 12.7932 7.17575 12.7465L11.9107 12.7465C12.3249 12.7465 12.6607 12.4107 12.6607 11.9965C12.6607 11.5823 12.3249 11.2465 11.9107 11.2465L7.17319 11.2465C7.15748 11.2023 7.14035 11.1585 7.1218 11.1151L4.53613 5.07121Z" fill="currentColor" />
              </svg>
            )}
          </button>
        </div>

        {submitStatus === 'success' && (
          <Alert
            variant="success"
            title="Thanks for subscribing"
            message="You'll receive our newsletter soon."
          />
        )}

        {submitStatus === 'error' && (
          <Alert
            variant="error"
            title="Something went wrong"
            message="Sorry, there was an error subscribing. Please try again."
          />
        )}
      </form>
    </div>
  );
}
