'use client';

import { useState, useEffect, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@uprise/ui';
import { Alert } from "@uprise/ui";
import {
  FormBillingDetails,
  FormCheckoutPaymentMethod,
  type CheckoutPaymentMethodValues,
} from '@/components/prog/shared/forms';
import Breadcrumbs from '@/components/prog/shared/breadcrumbs';
import PaymentSecuritySection from '@/components/prog/shared/PaymentSecuritySection';
import { Loader2 } from 'lucide-react';

const PLAN_DISPLAY: Record<
  string,
  { price: string; priceCents: number; priceYearCents?: number; description: string }
> = {
  Starter: {
    price: '$49',
    priceCents: 4900,
    priceYearCents: 49900,
    description: 'For small teams and local campaigns',
  },
  Growth: {
    price: '$149',
    priceCents: 14900,
    priceYearCents: 159900,
    description: 'For growing organisations and regional campaigns',
  },
  Scale: {
    price: '$298',
    priceCents: 29800,
    priceYearCents: 319900,
    description: 'For larger teams and multi-region operations',
  },
};

/** Tax rate as decimal (e.g. 0.10 = 10% GST) */
const TAX_RATE = 0.10;

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 22 22"
      fill="currentColor"
      className={`ease-out duration-200 transition-transform ${open ? 'rotate-180' : ''}`}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M4.06103 7.80259C4.30813 7.51431 4.74215 7.48092 5.03044 7.72802L10.9997 12.8445L16.9689 7.72802C17.2572 7.48092 17.6912 7.51431 17.9383 7.80259C18.1854 8.09088 18.1521 8.5249 17.8638 8.772L11.4471 14.272C11.1896 14.4927 10.8097 14.4927 10.5523 14.272L4.1356 8.772C3.84731 8.5249 3.81393 8.09088 4.06103 7.80259Z"
        fill=""
      />
    </svg>
  );
}

function CheckoutContent() {
  const searchParams = useSearchParams();
  const planName = searchParams.get('plan') || 'Growth';
  const periodParam = searchParams.get('period')?.toLowerCase();
  const isMonthly = periodParam !== 'year';
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<CheckoutPaymentMethodValues | null>(null);
  const paymentMethodFormRef = useRef<{ validate: () => boolean }>(null);

  const planInfo = planName ? PLAN_DISPLAY[planName] : null;
  const subtotalCents = planInfo
    ? isMonthly
      ? planInfo.priceCents
      : (planInfo.priceYearCents ?? planInfo.priceCents)
    : 0;
  const taxCents = Math.round(subtotalCents * TAX_RATE);
  const totalCents = subtotalCents + taxCents;
  const periodLabel = isMonthly ? 'month' : 'year';

  useEffect(() => {
    if (!planName) setError('No plan selected');
  }, [planName]);

  const handleProceedToPayment = () => {
    // no-op (static replica)
    setLoading(false);
  };

  if (!planName) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 py-12">
        <Alert variant="error" title="No plan selected" message="Please select a plan from the plans page." />
        <Button asChild>
          <Link href="/future/plans">View Plans</Link>
        </Button>
      </div>
    );
  }

  return (
    <section className="page-stack">
      <div className="w-full gap-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">Checkout</h2>
          <Breadcrumbs
            items={[
              { label: 'Home', href: '/prog' },
              { label: 'Plans', href: '/future/plans' },
              { label: 'Checkout' },
            ]}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-5">
          {/* Left column */}
          <div className="w-full space-y-6 lg:col-span-3">
            {/* Billing details */}
            <FormBillingDetails namePrefix="billing" required />
          </div>

          {/* Right column */}
          <div className="w-full space-y-6 lg:col-span-2">
            {/* Your Order */}
            <div className="rounded-[10px] border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-white/[0.03]">
              <h3 className="border-b border-gray-200 px-4 py-5 text-lg font-medium text-gray-800 dark:border-gray-800 dark:text-white/90 sm:px-6">
                Your Order
              </h3>
              <div className="px-6 pt-1 pb-6">
                <table className="w-full text-gray-800 dark:text-white/90">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-800">
                      <th className="py-5 text-left text-base font-medium">Product</th>
                      <th className="py-5 text-right text-base font-medium">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-gray-200 dark:border-gray-800">
                      <td className="py-5">
                        <div className="text-sm font-medium">{planName} Plan</div>
                        {planInfo?.description && (
                          <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                            {planInfo.description}
                          </div>
                        )}
                      </td>
                      <td className="py-5 text-right text-sm">
                        {planInfo
                          ? isMonthly
                            ? `${planInfo.price}/${periodLabel}`
                            : `$${(subtotalCents / 100).toFixed(2)}/${periodLabel}`
                          : '-'}
                      </td>
                    </tr>
                    <tr className="border-b border-gray-200 dark:border-gray-800">
                      <td className="py-5 text-sm">Tax ({(TAX_RATE * 100).toFixed(0)}%)</td>
                      <td className="py-5 text-right text-sm">
                        {planInfo ? `${formatPrice(taxCents)}/${periodLabel}` : '-'}
                      </td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="pt-5 text-base font-medium">Total</td>
                      <td className="pt-5 text-right text-base font-medium">
                        {planInfo ? `${formatPrice(totalCents)}/${periodLabel}` : '-'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Payment method */}
            <div className="rounded-[10px] border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-white/[0.03]">
              <div className="border-b border-gray-200 px-6 py-5 dark:border-gray-800">
                <h3 className="text-lg font-medium text-gray-800 dark:text-white/90">
                  Payment Method
                </h3>
              </div>
              <div className="p-6">
                <FormCheckoutPaymentMethod
                  ref={paymentMethodFormRef}
                  tenantId={undefined}
                  networkId={undefined}
                  namePrefix="paymentMethod"
                  onChange={setPaymentMethod}
                  required
                />
              </div>
            </div>

            {/* Pay button */}
            <Button
              className="cursor-pointer h-12 flex w-full items-center justify-center rounded-lg bg-brand-500 p-3 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
              onClick={handleProceedToPayment}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Redirecting...
                </>
              ) : (
                <>Pay {planInfo ? formatPrice(totalCents) : ''}/{periodLabel}</>
              )}
            </Button>

            {error && (
              <Alert variant="error" title="Error" message={error} />
            )}
          </div>
        </div>

        <PaymentSecuritySection />
      </div>
    </section>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[400px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      }
    >
      <CheckoutContent />
    </Suspense>
  );
}
