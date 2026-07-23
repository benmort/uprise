'use client';

import { useState, useRef } from 'react';
import { Button } from '@uprise/ui';
import { Modal } from "@/components/ui/modal";
import { Skeleton } from '@uprise/ui';
import {
  FormCreditCard,
  FormBillingDetails,
  type FormCreditCardRef,
  type BillingDetailsFormValues,
} from '@/components/prog/shared/forms';
import {
  Check,
  Edit,
  X,
  Plus,
  Download,
  Eye,
  CreditCard,
  Loader2,
  Trash2,
  Star,
} from 'lucide-react';
import { Suspense } from 'react';
import { CanManageBilling } from '@/components/prog/protected-route';
import { Alert } from "@uprise/ui";

interface PaymentMethod {
  id: string;
  type: 'mastercard' | 'visa' | 'paypal';
  last4: string;
  expiry?: string;
  email?: string;
  isDefault: boolean;
}

interface Invoice {
  id: string;
  name: string;
  date: string;
  price: string;
  plan: string;
  status: 'paid' | 'unpaid';
}


function BillingSkeleton() {
  return (
    <div className="mx-auto max-w-7xl">
      <div className="animate-pulse">
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-6"></div>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 h-96 bg-gray-200 dark:bg-gray-700 rounded-2xl"></div>
          <div className="h-96 bg-gray-200 dark:bg-gray-700 rounded-2xl"></div>
        </div>
      </div>
    </div>
  );
}

function PaymentMethodsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex gap-5 rounded-xl border border-gray-200 p-3 pr-5 dark:border-gray-800">
          <Skeleton className="h-12 w-12 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-20" />
            <div className="pt-2 flex gap-2">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-6 w-16" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function InvoicesSkeleton() {
  return (
    <>
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <tr key={i} className="border-y border-gray-200 dark:border-gray-800">
          <td className="px-6 py-3 first:pl-0">
            <div className="flex gap-3 pl-2">
              <Skeleton className="h-8 w-7" />
              <Skeleton className="h-4 w-24" />
            </div>
          </td>
          <td className="px-6 py-3"><Skeleton className="h-4 w-20" /></td>
          <td className="px-6 py-3"><Skeleton className="h-4 w-14" /></td>
          <td className="px-6 py-3"><Skeleton className="h-4 w-16" /></td>
          <td className="px-6 py-3"><Skeleton className="h-5 w-14 rounded-full" /></td>
          <td className="px-6 py-3 text-right">
            <div className="flex justify-end gap-2">
              <Skeleton className="h-9 w-9" />
              <Skeleton className="h-9 w-9" />
            </div>
          </td>
        </tr>
      ))}
    </>
  );
}

function PaymentMethodIcon({ type }: { type: string }) {
  switch (type) {
    case 'mastercard':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="33" height="32" viewBox="0 0 33 32" fill="none">
          <circle cx="10.5" cy="16" r="9" fill="#E80B26"></circle>
          <circle cx="22.5" cy="16" r="9" fill="#F59D31"></circle>
          <path d="M16.5 22.7085C18.3413 21.0605 19.5 18.6658 19.5 16.0002C19.5 13.3347 18.3413 10.9399 16.5 9.29199C14.6587 10.9399 13.5 13.3347 13.5 16.0002C13.5 18.6658 14.6587 21.0605 16.5 22.7085Z" fill="#FC6020"></path>
        </svg>
      );
    case 'visa':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="33" height="18" viewBox="0 0 33 18" fill="none">
          <g clipPath="url(#clip0_5607_13291)">
            <path d="M21.2243 3.90918C18.9651 3.90918 16.9462 5.06569 16.9462 7.20245C16.9462 9.65285 20.5268 9.82209 20.5268 11.0531C20.5268 11.5715 19.9254 12.0355 18.8981 12.0355C17.4403 12.0355 16.3507 11.3871 16.3507 11.3871L15.8844 13.5434C15.8844 13.5434 17.1396 14.091 18.8061 14.091C21.2762 14.091 23.2198 12.8777 23.2198 10.7045C23.2198 8.11511 19.6243 7.95089 19.6243 6.80831C19.6243 6.4022 20.118 5.95732 21.1423 5.95732C22.298 5.95732 23.2409 6.42885 23.2409 6.42885L23.6972 4.34631C23.6972 4.34631 22.6712 3.90918 21.2243 3.90918ZM0.554718 4.06638L0.5 4.38071C0.5 4.38071 1.45047 4.55249 2.3065 4.89522C3.40871 5.28816 3.48725 5.51692 3.67287 6.22747L5.69567 13.9289H8.40731L12.5848 4.06638H9.87935L7.19509 10.7719L6.09978 5.08798C5.99931 4.43747 5.49047 4.06638 4.86767 4.06638H0.554718ZM13.6726 4.06638L11.5503 13.9289H14.1301L16.245 4.06634L13.6726 4.06638ZM28.0612 4.06638C27.4391 4.06638 27.1095 4.39529 26.8676 4.97009L23.088 13.9289H25.7934L26.3168 12.4357H29.6128L29.9311 13.9289H32.3182L30.2357 4.06638H28.0612ZM28.413 6.73093L29.2149 10.4318H27.0665L28.413 6.73093Z" fill="#1434CB"></path>
          </g>
          <defs>
            <clipPath id="clip0_5607_13291">
              <rect width="32" height="17.4545" fill="white" transform="translate(0.5 0.272949)"></rect>
            </clipPath>
          </defs>
        </svg>
      );
    case 'paypal':
      return (
        <svg width="33" height="32" viewBox="0 0 33 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="0.5" width="32" height="32" rx="16" fill="#1B4BF1"></rect>
          <path opacity="0.5" d="M23.2413 12.5812C23.457 11.1743 23.2413 10.2365 22.4861 9.37074C21.6589 8.39679 20.1486 8 18.2066 8H12.6326C12.237 8 11.9133 8.28858 11.8414 8.68537L9.50392 23.4749C9.46796 23.7635 9.68373 24.016 9.97142 24.016H13.4237L13.172 25.5311C13.136 25.7836 13.3159 26 13.6035 26H16.5164C16.8761 26 17.1637 25.7475 17.1997 25.4228L17.8111 21.5992C17.847 21.2745 18.1707 21.022 18.4943 21.022H18.9259C21.7309 21.022 23.9605 19.8677 24.6078 16.5491C24.8595 15.1784 24.7516 13.988 24.0324 13.1944C23.8166 12.9419 23.5649 12.7615 23.2413 12.5812Z" fill="white"></path>
          <path d="M23.2413 12.5812C23.457 11.1743 23.2413 10.2365 22.4861 9.37074C21.6589 8.39679 20.1486 8 18.2066 8H12.6326C12.237 8 11.9133 8.28858 11.8414 8.68537L9.50392 23.4749C9.46796 23.7635 9.68373 24.016 9.97142 24.016H13.4237L14.2509 18.6774C14.3228 18.2806 14.6464 17.992 15.042 17.992H16.6962C19.9328 17.992 22.4501 16.6934 23.1693 12.8697C23.2053 12.7976 23.2053 12.6894 23.2413 12.5812Z" fill="white"></path>
        </svg>
      );
    default:
      return <CreditCard className="w-8 h-8" />;
  }
}

function InvoiceIcon() {
  return (
    <svg className="h-8 w-7" xmlns="http://www.w3.org/2000/svg" width="21" height="24" viewBox="0 0 21 24" fill="none">
      <path d="M4.8125 0.625C4.03047 0.625 3.39062 1.26484 3.39062 2.04688V21.9531C3.39062 22.7352 4.03047 23.375 4.8125 23.375H19.0312C19.8133 23.375 20.4531 22.7352 20.4531 21.9531V6.3125L14.7656 0.625H4.8125Z" fill="#E2E5E7"></path>
      <path d="M16.1875 6.3125H20.4531L14.7656 0.625V4.89062C14.7656 5.67266 15.4055 6.3125 16.1875 6.3125Z" fill="#B0B7BD"></path>
      <path d="M20.4531 10.5781L16.1875 6.3125H20.4531V10.5781Z" fill="#CAD1D8"></path>
      <path d="M17.6094 19.1094C17.6094 19.5004 17.2895 19.8203 16.8984 19.8203H1.25781C0.866797 19.8203 0.546875 19.5004 0.546875 19.1094V12C0.546875 11.609 0.866797 11.2891 1.25781 11.2891H16.8984C17.2895 11.2891 17.6094 11.609 17.6094 12V19.1094Z" fill="#F15642"></path>
      <path d="M3.64648 14.0956C3.64648 13.9079 3.79436 13.7031 4.03252 13.7031H5.34562C6.085 13.7031 6.75044 14.1979 6.75044 15.1463C6.75044 16.045 6.085 16.5455 5.34562 16.5455H4.39652V17.2962C4.39652 17.5465 4.23727 17.6879 4.03252 17.6879C3.84484 17.6879 3.64648 17.5465 3.64648 17.2962V14.0956ZM4.39652 14.419V15.8352H5.34562C5.72669 15.8352 6.02812 15.499 6.02812 15.1463C6.02812 14.7489 5.72669 14.419 5.34562 14.419H4.39652Z" fill="white"></path>
      <path d="M7.86314 17.6875C7.67545 17.6875 7.4707 17.5851 7.4707 17.3356V14.1065C7.4707 13.9025 7.67545 13.7539 7.86314 13.7539H9.16487C11.7626 13.7539 11.7058 17.6875 9.21605 17.6875H7.86314ZM8.22145 14.4478V16.9944H9.16487C10.6998 16.9944 10.768 14.4478 9.16487 14.4478H8.22145Z" fill="white"></path>
      <path d="M12.6284 14.494V15.3976H14.078C14.2828 15.3976 14.4875 15.6023 14.4875 15.8007C14.4875 15.9884 14.2828 16.1419 14.078 16.1419H12.6284V17.3356C12.6284 17.5347 12.4869 17.6875 12.2879 17.6875C12.0376 17.6875 11.8848 17.5347 11.8848 17.3356V14.1065C11.8848 13.9025 12.0383 13.7539 12.2879 13.7539H14.2835C14.5337 13.7539 14.6816 13.9025 14.6816 14.1065C14.6816 14.2885 14.5337 14.4933 14.2835 14.4933H12.6284V14.494Z" fill="white"></path>
      <path d="M16.8984 19.8203H3.39062V20.5312H16.8984C17.2895 20.5312 17.6094 20.2113 17.6094 19.8203V19.1094C17.6094 19.5004 17.2895 19.8203 16.8984 19.8203Z" fill="#CAD1D8"></path>
    </svg>
  );
}

function formatInvoiceRow(inv: Record<string, unknown>, planName?: string): Invoice {
  const createdAt = inv.createdAt ? new Date(String(inv.createdAt)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-';
  const total = inv.total != null ? `$${Number(inv.total).toFixed(2)}` : '-';
  return {
    id: String(inv.id ?? ''),
    name: `Invoice #${inv.invoiceNumber ?? inv.id ?? ''}`,
    date: createdAt,
    price: total,
    plan: planName ?? 'Plan',
    status: (inv.status === 'paid' ? 'paid' : 'unpaid') as 'paid' | 'unpaid',
  };
}

function formatPaymentMethodRow(pm: Record<string, unknown>): PaymentMethod {
  const brand = (String(pm.brand ?? pm.type ?? 'card').toLowerCase());
  const type = (brand === 'visa' || brand === 'mastercard' || brand === 'paypal' ? brand : 'mastercard') as 'mastercard' | 'visa' | 'paypal';
  const expMonth = pm.expMonth != null ? String(pm.expMonth).padStart(2, '0') : '';
  const expYear = pm.expYear != null ? String(pm.expYear).slice(-2) : '';
  return {
    id: String(pm.id ?? ''),
    type,
    last4: String(pm.last4 ?? '****'),
    expiry: expMonth && expYear ? `${expMonth}/${expYear}` : undefined,
    isDefault: Boolean(pm.isDefault),
  };
}

function CurrentPlan() {
  const [subscriptions] = useState<Record<string, unknown>[]>([]);
  const [invoices] = useState<Record<string, unknown>[]>([]);
  const [paymentMethods] = useState<Record<string, unknown>[]>([]);
  const [loading] = useState(false);
  const [isPortalLoading] = useState(false);
  const [addCardModalOpen, setAddCardModalOpen] = useState(false);
  const [isAddCardPending, setIsAddCardPending] = useState(false);
  const [addCardError, setAddCardError] = useState<string | null>(null);
  const [actionLoadingId] = useState<string | null>(null);
  const [billingDetails, setBillingDetails] = useState<BillingDetailsFormValues>({
    name: '',
    address: { street: '', city: '', state: '', country: 'australia', postalCode: '' },
    gstNumber: '',
  });
  const [billingAddressModalOpen, setBillingAddressModalOpen] = useState(false);
  const [paymentMethodError] = useState<string | null>(null);
  const [invoicePage, setInvoicePage] = useState(1);
  const INVOICES_PER_PAGE = 5;
  const addCardFormRef = useRef<FormCreditCardRef>(null);

  const planName = 'Professional';

  const handleCustomerPortal = () => {};
  const handleSetDefault = (_paymentMethodId: string) => {};
  const handleRemovePaymentMethod = (_paymentMethodId: string) => {};
  const handleInvoiceView = (_invoiceId: string) => {};
  const handleInvoiceDownload = (_invoiceId: string) => {};
  const handleInvoiceDownloadAll = () => {};

  return (
    <div className="mx-auto max-w-7xl">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">Billing</h2>
          <nav>
            <ol className="flex items-center gap-1.5">
              <li>
                <a className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400" href="/">
                  Home
                  <svg className="stroke-current" width="17" height="16" viewBox="0 0 17 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M6.0765 12.667L10.2432 8.50033L6.0765 4.33366" stroke="" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"></path>
                  </svg>
                </a>
              </li>
              <li className="text-sm text-gray-800 dark:text-white/90">Billing</li>
            </ol>
          </nav>
        </div>

        <div className="mb-6 flex flex-col gap-6 xl:flex-row">
          {/* Plan Details */}
          <div className="rounded-2xl border border-gray-200 bg-white xl:w-4/6 dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="px-6 py-5">
              <h3 className="text-base font-medium text-gray-800 dark:text-white/90">Plan Details</h3>
            </div>
            <div className="grid grid-cols-1 gap-6 border-t border-gray-200 p-4 sm:p-6 lg:grid-cols-1 xl:grid-cols-2 dark:border-gray-800">
              <div>
                <ul className="divide-y divide-gray-100 rounded-t-xl border border-gray-200 p-5 dark:divide-gray-800 dark:border-gray-800">
                  <li className="py-3 first:pt-0">
                    <span className="block space-y-1.5 text-sm font-normal text-gray-500 dark:text-gray-400">`Current Plan`</span>
                    <span className="block text-sm font-medium text-gray-700 dark:text-gray-400">
                      {planName}
                    </span>
                  </li>
                  <li className="py-3">
                    <span className="block space-y-1.5 text-sm font-normal text-gray-500 dark:text-gray-400">Monthly Limits</span>
                    <span className="block text-sm font-medium text-gray-700 dark:text-gray-400">25,000 Orders</span>
                  </li>
                  <li className="py-3">
                    <span className="block space-y-1.5 text-sm font-normal text-gray-500 dark:text-gray-400">Cost</span>
                    <span className="block text-sm font-medium text-gray-700 dark:text-gray-400">
                      {subscriptions.length > 0 ? 'See invoice' : '-'}
                      <span className="text-xs text-gray-500 dark:text-gray-400">/month</span>
                    </span>
                  </li>
                  <li className="py-3">
                    <span className="block space-y-1.5 text-sm font-normal text-gray-500 dark:text-gray-400">Renewal Date</span>
                    <span className="block text-sm font-medium text-gray-700 dark:text-gray-400">
                      {subscriptions[0]
                        ? (() => {
                            const sub = subscriptions[0] as Record<string, unknown>;
                            const end = sub.currentPeriodEnd ?? sub.current_period_end;
                            return end ? new Date(String(end)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-';
                          })()
                        : '-'}
                    </span>
                  </li>
                </ul>
                <div className="rounded-b-xl border border-t-0 border-gray-200 p-5 dark:border-gray-800">
                  <div className="mb-5 flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-400">Orders</span>
                    <span className="text-sm text-gray-700 dark:text-gray-400">15,299 of 25,500 orders used</span>
                  </div>
                  <div className="relative h-2 w-full rounded-sm bg-gray-200 dark:bg-gray-800">
                    <div className="bg-brand-500 absolute left-0 h-full w-[55%] rounded-sm"></div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="mb-6 text-base font-medium text-gray-800 dark:text-white/90">Plan Benefits</h3>
                <ul className="space-y-3.5">
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-gray-700 dark:text-gray-500" />
                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400">25,500 orders per month</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-gray-700 dark:text-gray-500" />
                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Unlimited integrations</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-gray-700 dark:text-gray-500" />
                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Exclusive AutoFile discount</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-gray-700 dark:text-gray-500" />
                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400">10 GB Storage</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <X className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-medium text-gray-400 line-through">Custom Templates</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <X className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-medium text-gray-400 line-through">Advanced Marketing tool</span>
                  </li>
                </ul>
                <div className="mt-24 flex w-full flex-col items-center justify-between gap-3 sm:flex-row">
                  <Button
                    onClick={handleCustomerPortal}
                    disabled={isPortalLoading}
                    variant="outline"
                    className="cursor-pointer w-full sm:w-1/2"
                  >
                    {isPortalLoading ? 'Opening...' : 'Cancel Subscription'}
                  </Button>
                  <Button asChild className="cursor-pointer bg-brand-500 hover:bg-brand-600 text-white w-full sm:w-1/2">
                    <a href="/admin/plans">Upgrade Plan</a>
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Billing Info */}
          <div className="rounded-2xl border border-gray-200 bg-white xl:w-2/6 dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="px-6 py-5">
              <h3 className="text-base font-medium text-gray-800 dark:text-white/90">Billing Info</h3>
            </div>
            <div className="border-t border-gray-200 p-4 sm:p-6 dark:border-gray-800">
              <>
                <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                    <li className="flex items-center gap-5 py-2.5">
                      <span className="w-1/2 text-sm text-gray-500 sm:w-1/3 dark:text-gray-400">Name</span>
                      <span className="w-1/2 text-sm font-medium text-gray-700 sm:w-2/3 dark:text-gray-400">
                        {billingDetails.name || '-'}
                      </span>
                    </li>
                    <li className="flex items-center gap-5 py-2.5">
                      <span className="w-1/2 text-sm text-gray-500 sm:w-1/3 dark:text-gray-400">Street</span>
                      <span className="w-1/2 text-sm font-medium text-gray-700 sm:w-2/3 dark:text-gray-400">
                        {billingDetails.address?.street || '-'}
                      </span>
                    </li>
                    <li className="flex items-center gap-5 py-2.5">
                      <span className="w-1/2 text-sm text-gray-500 sm:w-1/3 dark:text-gray-400">City/State</span>
                      <span className="w-1/2 text-sm font-medium text-gray-700 sm:w-2/3 dark:text-gray-400">
                        {[billingDetails.address?.city, billingDetails.address?.state].filter(Boolean).join(', ') || '-'}
                      </span>
                    </li>
                    <li className="flex items-center gap-5 py-2.5">
                      <span className="w-1/2 text-sm text-gray-500 sm:w-1/3 dark:text-gray-400">Country</span>
                      <span className="w-1/2 text-sm font-medium text-gray-700 sm:w-2/3 dark:text-gray-400">
                        {billingDetails.address?.country || '-'}
                      </span>
                    </li>
                    <li className="flex items-center gap-5 py-2.5">
                      <span className="w-1/2 text-sm text-gray-500 sm:w-1/3 dark:text-gray-400">Postal code</span>
                      <span className="w-1/2 text-sm font-medium text-gray-700 sm:w-2/3 dark:text-gray-400">
                        {billingDetails.address?.postalCode || '-'}
                      </span>
                    </li>
                    <li className="flex items-center gap-5 py-2.5">
                      <span className="w-1/2 text-sm text-gray-500 sm:w-1/3 dark:text-gray-400">GST/VAT Number</span>
                      <span className="w-1/2 text-sm font-medium text-gray-700 sm:w-2/3 dark:text-gray-400">
                        {billingDetails.gstNumber || '-'}
                      </span>
                    </li>
                  </ul>
                  <div className="mt-10 xl:mt-2 2xl:mt-12">
                    <Button
                      variant="outline"
                      className="cursor-pointer w-full"
                      onClick={() => setBillingAddressModalOpen(true)}
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      Update Billing Information
                    </Button>
                  </div>
                </>
            </div>
          </div>
        </div>

        {/* Payment Methods */}
        <div className="mb-6 rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex flex-col justify-between gap-5 px-6 py-5 sm:flex-row sm:items-start">
            <div>
              <h3 className="text-base font-medium text-gray-800 dark:text-white/90">Payment Methods</h3>
            </div>
            <div>
              <Button
                variant="outline"
                className="cursor-pointer w-full sm:w-auto"
                onClick={() => setAddCardModalOpen(true)}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add New Card
              </Button>
            </div>
          </div>
          <div className="border-t border-gray-200 p-4 sm:p-6 dark:border-gray-800">
            {paymentMethodError && (
              <Alert variant="error" title="Error" message={paymentMethodError} className="mb-4" />
            )}
            {loading ? (
              <PaymentMethodsSkeleton />
            ) : (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {(paymentMethods.length > 0 ? paymentMethods.map((pm) => formatPaymentMethodRow(pm)) : []).map((method) => {
                  const methodCount = paymentMethods.length;
                  const isOnlyMethod = methodCount <= 1;
                  const isActionLoading = actionLoadingId === method.id;
                  return (
                    <div key={method.id} className="flex gap-5 rounded-xl border border-gray-200 p-3 pr-5 dark:border-gray-800">
                      <div className="inline-flex h-13 w-13 shrink-0 items-center justify-center rounded-lg border border-gray-200 dark:border-gray-800">
                        <PaymentMethodIcon type={method.type} />
                      </div>
                      <div>
                        <h3 className="mb-2 flex items-center gap-2 text-gray-800 dark:text-white/90 capitalize">
                          {method.type}
                          {method.isDefault && (
                            <span className="bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500 inline-flex items-center justify-center gap-1 rounded-full py-0.5 pr-2.5 pl-2 text-sm font-medium">
                              <Check className="w-3 h-3" />
                              Default
                            </span>
                          )}
                        </h3>
                        <div className="flex flex-wrap items-center justify-between gap-5">
                          <p className="text-sm font-normal text-gray-400 dark:text-gray-400">
                            **** **** **** {method.last4}
                          </p>
                          {method.expiry && (
                            <p className="text-sm font-normal text-gray-400 dark:text-gray-400">
                              Expiry {method.expiry}
                            </p>
                          )}
                          {method.email && (
                            <p className="text-sm font-normal text-gray-400 dark:text-gray-400">
                              {method.email}
                            </p>
                          )}
                        </div>
                        <div className="mt-4 flex flex-wrap gap-3">
                          <Button
                            variant="outline"
                            size="sm"
                            className="cursor-pointer h-6 px-3 py-1 text-xs"
                            onClick={() => handleSetDefault(method.id)}
                            disabled={method.isDefault || isOnlyMethod || isActionLoading}
                          >
                            {isActionLoading ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <>
                                <Star className="w-3 h-3 mr-1" />
                                Make default
                              </>
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="cursor-pointer h-6 px-3 py-1 text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                            onClick={() => handleRemovePaymentMethod(method.id)}
                            disabled={isOnlyMethod || isActionLoading}
                          >
                            {isActionLoading ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <>
                                <Trash2 className="w-3 h-3 mr-1" />
                                Delete
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          </div>

        {/* Update Billing Information Modal */}
        <Modal
          isOpen={billingAddressModalOpen}
          onClose={() => setBillingAddressModalOpen(false)}
          className="max-w-lg m-4"
        >
          <div className="p-6 sm:p-8">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90 mb-1">
              Update Billing Information
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              Update your billing information for invoices and receipts.
            </p>
            <FormBillingDetails
              namePrefix="billing"
              values={billingDetails}
              onChange={setBillingDetails}
              title=""
              noCard
              className="border-0 p-0"
            />
            <div className="mt-6 flex gap-3 justify-end">
              <Button
                variant="outline"
                onClick={() => setBillingAddressModalOpen(false)}
                className="cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                className="cursor-pointer bg-brand-500 hover:bg-brand-600"
                onClick={() => setBillingAddressModalOpen(false)}
              >
                Save
              </Button>
            </div>
          </div>
        </Modal>

        {/* Add New Card Modal */}
        <Modal
          isOpen={addCardModalOpen}
          onClose={() => !isAddCardPending && setAddCardModalOpen(false)}
          className="max-w-md m-4"
        >
          <div className="p-6 sm:p-8">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90 mb-1">
              Add New Card
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              Enter your card details below.
              <br/>
              Your card will be securely saved for future payments.
            </p>
            <FormCreditCard
              ref={addCardFormRef}
              namePrefix="newCard"
              required
              submitError={addCardError ?? undefined}
            />
            <div className="mt-6 flex gap-3 justify-end">
              <Button
                variant="outline"
                onClick={() => setAddCardModalOpen(false)}
                disabled={isAddCardPending}
                className="cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="cursor-pointer bg-brand-500 hover:bg-brand-600 text-white"
                disabled={isAddCardPending}
                onClick={() => {
                  setAddCardError(null);
                  const isValid = addCardFormRef.current?.validate();
                  if (!isValid) return;
                  setIsAddCardPending(true);
                  setAddCardModalOpen(false);
                  setIsAddCardPending(false);
                }}
              >
                {isAddCardPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Adding Card...
                  </>
                ) : (
                  'Add Card'
                )}
              </Button>
            </div>
          </div>
        </Modal>

        {/* Invoices */}
        <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="px-6">
            <div className="flex flex-col justify-between gap-5 py-4 sm:flex-row sm:items-center">
              <div>
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Invoices</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Access all your previous invoices.</p>
              </div>
              <div>
                <Button
                  variant="outline"
                  className="cursor-pointer w-full sm:w-auto"
                  onClick={handleInvoiceDownloadAll}
                  disabled={isPortalLoading || invoices.length === 0}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download All PDFs as ZIP
                </Button>
              </div>
            </div>
          </div>
          <div>
            <div className="custom-scrollbar overflow-x-auto px-6">
              <table className="min-w-full">
                <thead>
                  <tr className="border-y border-gray-200 dark:border-gray-800">
                    <th className="px-6 py-3 text-left text-sm font-normal text-gray-500 first:pl-0 dark:text-gray-400">Name</th>
                    <th className="px-6 py-3 text-left text-sm font-normal text-gray-500 dark:text-gray-400">Date</th>
                    <th className="px-6 py-3 text-left text-sm font-normal text-gray-500 dark:text-gray-400">Price</th>
                    <th className="px-6 py-3 text-left text-sm font-normal text-gray-500 dark:text-gray-400">Plan</th>
                    <th className="px-6 py-3 text-left text-sm font-normal text-gray-500 dark:text-gray-400">Status</th>
                    <th className="px-6 py-3 text-right text-sm font-normal text-gray-500 dark:text-gray-400">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                  {loading ? (
                    <InvoicesSkeleton />
                  ) : (
                    (() => {
                      const formatted = invoices.map((inv) => formatInvoiceRow(inv, planName));
                      const start = (invoicePage - 1) * INVOICES_PER_PAGE;
                      const paginated = formatted.slice(start, start + INVOICES_PER_PAGE);
                      return paginated.map((invoice) => (
                        <tr key={invoice.id}>
                          <td className="px-6 py-3 text-left whitespace-nowrap first:pl-0">
                            <div className="flex gap-3 pl-2">
                              <InvoiceIcon />
                              <p className="text-sm font-normal text-gray-700 dark:text-gray-400">{invoice.name}</p>
                            </div>
                          </td>
                          <td className="px-6 py-3 text-sm font-normal whitespace-nowrap text-gray-700 dark:text-gray-400">{invoice.date}</td>
                          <td className="px-6 py-3 text-sm font-normal whitespace-nowrap text-gray-700 dark:text-gray-400">{invoice.price}</td>
                          <td className="px-6 py-3 text-sm font-normal whitespace-nowrap text-gray-700 dark:text-gray-400">{invoice.plan}</td>
                          <td className="px-6 py-3">
                            <span className={`inline-flex items-center justify-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-medium ${
                              invoice.status === 'paid'
                                ? 'bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500'
                                : 'bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-500'
                            }`}>
                              {invoice.status === 'paid' ? 'Paid' : 'Unpaid'}
                            </span>
                          </td>
                          <td className="px-6 py-3">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="cursor-pointer h-9 w-9 p-0"
                                title="Download PDF"
                                onClick={() => handleInvoiceDownload(invoice.id)}
                              >
                                <Download className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="cursor-pointer h-9 w-9 p-0"
                                title="View invoice"
                                onClick={() => handleInvoiceView(invoice.id)}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ));
                    })()
                  )}
                </tbody>
              </table>
            </div>
            <div className="rounded-b-xl border-t border-gray-200 px-6 py-4 dark:border-gray-800">
              {(() => {
                const formatted = invoices.map((inv) => formatInvoiceRow(inv, planName));
                const totalInvoices = formatted.length;
                const totalPages = Math.max(1, Math.ceil(totalInvoices / INVOICES_PER_PAGE));
                const start = (invoicePage - 1) * INVOICES_PER_PAGE;
                const end = Math.min(start + INVOICES_PER_PAGE, totalInvoices);
                const showStart = totalInvoices === 0 ? 0 : start + 1;
                return (
                  <>
                    <div className="flex justify-center pb-4">
                      <div className="text-sm text-gray-700 dark:text-gray-400">
                        Showing <span>{showStart}</span> to <span>{end}</span> of <span>{totalInvoices}</span> invoices
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-8 bg-gray-50 dark:bg-white/[0.03] p-4 rounded-lg sm:bg-transparent dark:sm:bg-transparent sm:p-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="cursor-pointer"
                        disabled={invoicePage <= 1}
                        onClick={() => setInvoicePage((p) => Math.max(1, p - 1))}
                      >
                        <svg className="fill-current w-5 h-5 mr-2" viewBox="0 0 20 20" fill="none">
                          <path fillRule="evenodd" clipRule="evenodd" d="M2.58203 9.99868C2.58174 10.1909 2.6549 10.3833 2.80152 10.53L7.79818 15.5301C8.09097 15.8231 8.56584 15.8233 8.85883 15.5305C9.15183 15.2377 9.152 14.7629 8.85921 14.4699L5.13911 10.7472L16.6665 10.7472C17.0807 10.7472 17.4165 10.4114 17.4165 9.99715C17.4165 9.58294 17.0807 9.24715 16.6665 9.24715L5.14456 9.24715L8.85919 5.53016C9.15199 5.23717 9.15184 4.7623 8.85885 4.4695C8.56587 4.1767 8.09099 4.17685 7.79819 4.46984L2.84069 9.43049C2.68224 9.568 2.58203 9.77087 2.58203 9.99715C2.58203 9.99766 2.58203 9.99817 2.58203 9.99868Z"></path>
                        </svg>
                        <span className="hidden sm:inline">Previous</span>
                      </Button>
                      <span className="block text-sm font-medium text-gray-700 sm:hidden dark:text-gray-400">
                        Page {invoicePage} of {totalPages}
                      </span>
                      <ul className="hidden items-center gap-0.5 sm:flex">
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                          <li key={p}>
                            <Button
                              size="sm"
                              variant={p === invoicePage ? 'default' : 'outline'}
                              className={p === invoicePage ? 'cursor-pointer h-10 w-10 bg-brand-500 text-white hover:bg-brand-600' : 'cursor-pointer h-10 w-10'}
                              onClick={() => setInvoicePage(p)}
                            >
                              {p}
                            </Button>
                          </li>
                        ))}
                      </ul>
                      <Button
                        variant="outline"
                        size="sm"
                        className="cursor-pointer"
                        disabled={invoicePage >= totalPages}
                        onClick={() => setInvoicePage((p) => Math.min(totalPages, p + 1))}
                      >
                        <span className="hidden sm:inline">Next</span>
                        <svg className="fill-current w-5 h-5 ml-2" viewBox="0 0 20 20" fill="none">
                          <path fillRule="evenodd" clipRule="evenodd" d="M17.4165 9.9986C17.4168 10.1909 17.3437 10.3832 17.197 10.53L12.2004 15.5301C11.9076 15.8231 11.4327 15.8233 11.1397 15.5305C10.8467 15.2377 10.8465 14.7629 11.1393 14.4699L14.8594 10.7472L3.33203 10.7472C2.91782 10.7472 2.58203 10.4114 2.58203 9.99715C2.58203 9.58294 2.91782 9.24715 3.33203 9.24715L14.854 9.24715L11.1393 5.53016C10.8465 5.23717 10.8467 4.7623 11.1397 4.4695C11.4327 4.1767 11.9075 4.17685 12.2003 4.46984L17.1578 9.43049C17.3163 9.568 17.4165 9.77087 17.4165 9.99715C17.4165 9.99763 17.4165 9.99812 17.4165 9.9986Z"></path>
                        </svg>
                      </Button>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BillingPage() {
  return (
    <CanManageBilling>
      <div className="page-stack">
        <Suspense fallback={<BillingSkeleton />}>
          <CurrentPlan />
        </Suspense>
      </div>
    </CanManageBilling>
  );
}
