'use client';

import * as React from 'react';
import { FormSelect } from './form-select';
import { FormCreditCard, type FormCreditCardRef } from './form-credit-card';
// Non-functional port: no live payment service — return no saved methods so the
// component falls through to the "add new card" path.
const clientPaymentService = {
  getPaymentMethods: async (
    _tenantId: string,
    _networkId: string,
  ): Promise<{ paymentMethods: Record<string, unknown>[] }> => ({ paymentMethods: [] }),
};
import { CreditCard, Check } from 'lucide-react';

const ADD_NEW_CARD_VALUE = '__add_new_card__';
const USE_EXISTING_VALUE = '__use_existing__';

function PaymentMethodIcon({ type }: { type: string }) {
  const t = type.toLowerCase();
  if (t === 'mastercard') {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" width="33" height="32" viewBox="0 0 33 32" fill="none">
        <circle cx="10.5" cy="16" r="9" fill="#E80B26" />
        <circle cx="22.5" cy="16" r="9" fill="#F59D31" />
        <path d="M16.5 22.7085C18.3413 21.0605 19.5 18.6658 19.5 16.0002C19.5 13.3347 18.3413 10.9399 16.5 9.29199C14.6587 10.9399 13.5 13.3347 13.5 16.0002C13.5 18.6658 14.6587 21.0605 16.5 22.7085Z" fill="#FC6020" />
      </svg>
    );
  }
  if (t === 'visa') {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" width="33" height="18" viewBox="0 0 33 18" fill="none">
        <g clipPath="url(#clip0_visa_checkout)">
          <path d="M21.2243 3.90918C18.9651 3.90918 16.9462 5.06569 16.9462 7.20245C16.9462 9.65285 20.5268 9.82209 20.5268 11.0531C20.5268 11.5715 19.9254 12.0355 18.8981 12.0355C17.4403 12.0355 16.3507 11.3871 16.3507 11.3871L15.8844 13.5434C15.8844 13.5434 17.1396 14.091 18.8061 14.091C21.2762 14.091 23.2198 12.8777 23.2198 10.7045C23.2198 8.11511 19.6243 7.95089 19.6243 6.80831C19.6243 6.4022 20.118 5.95732 21.1423 5.95732C22.298 5.95732 23.2409 6.42885 23.2409 6.42885L23.6972 4.34631C23.6972 4.34631 22.6712 3.90918 21.2243 3.90918ZM0.554718 4.06638L0.5 4.38071C0.5 4.38071 1.45047 4.55249 2.3065 4.89522C3.40871 5.28816 3.48725 5.51692 3.67287 6.22747L5.69567 13.9289H8.40731L12.5848 4.06638H9.87935L7.19509 10.7719L6.09978 5.08798C5.99931 4.43747 5.49047 4.06638 4.86767 4.06638H0.554718ZM13.6726 4.06638L11.5503 13.9289H14.1301L16.245 4.06634L13.6726 4.06638ZM28.0612 4.06638C27.4391 4.06638 27.1095 4.39529 26.8676 4.97009L23.088 13.9289H25.7934L26.3168 12.4357H29.6128L29.9311 13.9289H32.3182L30.2357 4.06638H28.0612ZM28.413 6.73093L29.2149 10.4318H27.0665L28.413 6.73093Z" fill="#1434CB" />
        </g>
        <defs>
          <clipPath id="clip0_visa_checkout">
            <rect width="32" height="17.4545" fill="white" transform="translate(0.5 0.272949)" />
          </clipPath>
        </defs>
      </svg>
    );
  }
  if (t === 'paypal') {
    return (
      <svg width="33" height="32" viewBox="0 0 33 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="0.5" width="32" height="32" rx="16" fill="#1B4BF1" />
        <path opacity="0.5" d="M23.2413 12.5812C23.457 11.1743 23.2413 10.2365 22.4861 9.37074C21.6589 8.39679 20.1486 8 18.2066 8H12.6326C12.237 8 11.9133 8.28858 11.8414 8.68537L9.50392 23.4749C9.46796 23.7635 9.68373 24.016 9.97142 24.016H13.4237L13.172 25.5311C13.136 25.7836 13.3159 26 13.6035 26H16.5164C16.8761 26 17.1637 25.7475 17.1997 25.4228L17.8111 21.5992C17.847 21.2745 18.1707 21.022 18.4943 21.022H18.9259C21.7309 21.022 23.9605 19.8677 24.6078 16.5491C24.8595 15.1784 24.7516 13.988 24.0324 13.1944C23.8166 12.9419 23.5649 12.7615 23.2413 12.5812Z" fill="white" />
        <path d="M23.2413 12.5812C23.457 11.1743 23.2413 10.2365 22.4861 9.37074C21.6589 8.39679 20.1486 8 18.2066 8H12.6326C12.237 8 11.9133 8.28858 11.8414 8.68537L9.50392 23.4749C9.46796 23.7635 9.68373 24.016 9.97142 24.016H13.4237L14.2509 18.6774C14.3228 18.2806 14.6464 17.992 15.042 17.992H16.6962C19.9328 17.992 22.4501 16.6934 23.1693 12.8697C23.2053 12.7976 23.2053 12.6894 23.2413 12.5812Z" fill="white" />
      </svg>
    );
  }
  return <CreditCard className="w-8 h-8" />;
}

export interface FormCheckoutPaymentMethodRef {
  validate: () => boolean;
}

export interface SavedPaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expiry?: string;
  isDefault?: boolean;
}

export interface CheckoutPaymentMethodValues {
  /** Stripe payment method ID when using a saved card, or null when adding new */
  paymentMethodId: string | null;
  /** Card details when adding new card */
  cardNumber: string;
  expiry: string;
  cvc: string;
}

export interface FormCheckoutPaymentMethodProps {
  /** Tenant ID - required to fetch saved payment methods */
  tenantId: string | undefined;
  /** Network ID - required for payment methods API */
  networkId: string | number | undefined;
  /** Optional field name prefix */
  namePrefix?: string;
  /** Change handler */
  onChange?: (values: CheckoutPaymentMethodValues) => void;
  /** Whether payment is required */
  required?: boolean;
  /** Additional class */
  className?: string;
  /** Submit/API error - passed to FormCreditCard */
  submitError?: string;
}

export const FormCheckoutPaymentMethod = React.forwardRef<
  FormCheckoutPaymentMethodRef,
  FormCheckoutPaymentMethodProps
>(function FormCheckoutPaymentMethod(
  {
    tenantId,
    networkId,
    namePrefix = 'paymentMethod',
    onChange,
    required = false,
    className = '',
    submitError = '',
  },
  ref
) {
  const [savedMethods, setSavedMethods] = React.useState<SavedPaymentMethod[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [mode, setMode] = React.useState<string>(ADD_NEW_CARD_VALUE);
  const [selectedSavedMethodId, setSelectedSavedMethodId] = React.useState<string | null>(null);
  const [cardValues, setCardValues] = React.useState({ cardNumber: '', expiry: '', cvc: '' });
  const cardFormRef = React.useRef<FormCreditCardRef>(null);

  const showCardFields = mode === ADD_NEW_CARD_VALUE || savedMethods.length === 0;
  const showSavedMethodsList = mode === USE_EXISTING_VALUE && savedMethods.length > 0;

  React.useImperativeHandle(
    ref,
    () => ({
      validate: () => {
        if (showCardFields) return cardFormRef.current?.validate() ?? false;
        if (showSavedMethodsList) return !!selectedSavedMethodId;
        return true;
      },
    }),
    [showCardFields, showSavedMethodsList, selectedSavedMethodId]
  );

  React.useEffect(() => {
    if (!tenantId || networkId == null) {
      setLoading(false);
      setSavedMethods([]);
      setMode(ADD_NEW_CARD_VALUE);
      setSelectedSavedMethodId(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    clientPaymentService
      .getPaymentMethods(tenantId, networkId.toString())
      .then((res) => {
        if (cancelled) return;
        const raw = (res.paymentMethods ?? []) as Record<string, unknown>[];
        const methods: SavedPaymentMethod[] = raw
          .filter((pm) => pm && typeof pm.id === 'string')
          .map((pm) => {
            const brand = String(pm.brand ?? pm.type ?? 'card').toLowerCase();
            const expMonth = pm.expMonth != null ? String(pm.expMonth).padStart(2, '0') : '';
            const expYear = pm.expYear != null ? String(pm.expYear).slice(-2) : '';
            return {
              id: String(pm.id),
              brand,
              last4: String(pm.last4 ?? '****'),
              expiry: expMonth && expYear ? `${expMonth}/${expYear}` : undefined,
              isDefault: Boolean(pm.isDefault),
            };
          });
        setSavedMethods(methods);
        if (methods.length > 0) {
          setMode(USE_EXISTING_VALUE);
          const defaultPm = methods.find((m) => m.isDefault) ?? methods[0];
          setSelectedSavedMethodId(defaultPm.id);
        } else {
          setMode(ADD_NEW_CARD_VALUE);
          setSelectedSavedMethodId(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSavedMethods([]);
          setMode(ADD_NEW_CARD_VALUE);
          setSelectedSavedMethodId(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, networkId]);

  React.useEffect(() => {
    if (!onChange) return;
    if (showCardFields) {
      onChange({
        paymentMethodId: null,
        ...cardValues,
      });
    } else if (selectedSavedMethodId) {
      onChange({
        paymentMethodId: selectedSavedMethodId,
        cardNumber: '',
        expiry: '',
        cvc: '',
      });
    }
  }, [mode, showCardFields, selectedSavedMethodId, cardValues, onChange]);

  const selectOptions: { value: string; label: string }[] = [];
  if (savedMethods.length > 0) {
    selectOptions.push({ value: USE_EXISTING_VALUE, label: 'Use existing payment method' });
  }
  selectOptions.push({ value: ADD_NEW_CARD_VALUE, label: 'Add new card' });

  if (loading) {
    return (
      <div className={`space-y-5 ${className}`}>
        <div className="h-10 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700" />
        <div className="grid grid-cols-2 gap-5">
          <div className="h-10 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700" />
          <div className="h-10 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700" />
        </div>
      </div>
    );
  }

  const handleModeChange = (value: string) => {
    // Guard against placeholder selection - default to sensible value
    if (value === '') {
      if (savedMethods.length > 0) {
        setMode(USE_EXISTING_VALUE);
        const defaultPm = savedMethods.find((m) => m.isDefault) ?? savedMethods[0];
        setSelectedSavedMethodId(defaultPm.id);
      } else {
        setMode(ADD_NEW_CARD_VALUE);
        setSelectedSavedMethodId(null);
      }
      return;
    }
    setMode(value);
    if (value === ADD_NEW_CARD_VALUE) {
      setSelectedSavedMethodId(null);
    } else if (value === USE_EXISTING_VALUE && savedMethods.length > 0) {
      const defaultPm = savedMethods.find((m) => m.isDefault) ?? savedMethods[0];
      setSelectedSavedMethodId(defaultPm.id);
    }
  };

  return (
    <div className={`space-y-5 ${className}`}>
      <FormSelect
        id={`${namePrefix}.savedCard`}
        name={`${namePrefix}.savedCard`}
        label="Payment method"
        placeholder="Select payment method"
        options={selectOptions}
        value={mode}
        onChange={handleModeChange}
        required={required}
      />

      {showSavedMethodsList && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Choose a saved card
          </p>
          <div className="grid grid-cols-1 gap-5 w-full">
            {savedMethods.map((pm) => {
              const iconType = ['visa', 'mastercard', 'paypal'].includes(pm.brand) ? pm.brand : 'card';
              const isSelected = selectedSavedMethodId === pm.id;
              return (
                <button
                  key={pm.id}
                  type="button"
                  onClick={() => setSelectedSavedMethodId(pm.id)}
                  className={`flex gap-5 rounded-xl border p-3 pr-5 text-left transition-colors ${
                    isSelected
                      ? 'border-brand-500 bg-brand-50 dark:border-brand-500 dark:bg-brand-500/10'
                      : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-800 dark:bg-white/[0.02] dark:hover:border-gray-700'
                  }`}
                >
                  <div className="inline-flex h-13 w-13 shrink-0 items-center justify-center rounded-lg border border-gray-200 dark:border-gray-800">
                    <PaymentMethodIcon type={iconType} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="mb-2 flex items-center gap-2 text-gray-800 dark:text-white/90 capitalize">
                      {pm.brand}
                      {pm.isDefault && (
                        <span className="bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500 inline-flex items-center justify-center gap-1 rounded-full py-0.5 pr-2.5 pl-2 text-sm font-medium">
                          <Check className="w-3 h-3" />
                          Default
                        </span>
                      )}
                      {isSelected && (
                        <span className="bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-500 inline-flex items-center justify-center gap-1 rounded-full py-0.5 pr-2.5 pl-2 text-sm font-medium">
                          <Check className="w-3 h-3" />
                          Selected
                        </span>
                      )}
                    </h3>
                    <div className="flex flex-wrap items-center justify-between gap-5">
                      <p className="text-sm font-normal text-gray-400 dark:text-gray-400">
                        **** **** **** {pm.last4}
                      </p>
                      {pm.expiry && (
                        <p className="text-sm font-normal text-gray-400 dark:text-gray-400">
                          Expiry {pm.expiry}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {showCardFields && (
        <FormCreditCard
          ref={cardFormRef}
          namePrefix={namePrefix}
          values={cardValues}
          onChange={setCardValues}
          required={required}
          submitError={submitError}
        />
      )}
    </div>
  );
});
