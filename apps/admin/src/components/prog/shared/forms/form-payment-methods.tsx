'use client';

import * as React from 'react';
import { FormSectionCard } from './form-section-card';
import { FormCreditCard } from './form-credit-card';
import { Button } from '@uprise/ui';
import { Plus } from 'lucide-react';
import type { CreditCardFormValues } from './form-credit-card';

export interface FormPaymentMethodsProps {
  /** Section title */
  title?: string;
  /** Callback when Add New Card is clicked */
  onAddNewCard?: () => void;
  /** Whether to show the credit card form (e.g. when adding a new card) */
  showCardForm?: boolean;
  /** Credit card form values (controlled) */
  cardValues?: Partial<CreditCardFormValues>;
  /** Credit card form change handler */
  onCardChange?: (values: CreditCardFormValues) => void;
  /** Callback when card form is submitted (e.g. Save card) */
  onSaveCard?: (values: CreditCardFormValues) => void;
  /** Callback to cancel adding a new card */
  onCancelAddCard?: () => void;
  /** Whether the add card action is loading */
  isAdding?: boolean;
  /** Additional class for the container */
  className?: string;
}

export function FormPaymentMethods({
  title = 'Payment Methods',
  onAddNewCard,
  showCardForm = false,
  cardValues = {},
  onCardChange,
  onSaveCard,
  onCancelAddCard,
  isAdding = false,
  className = '',
}: FormPaymentMethodsProps) {
  const [localCardValues, setLocalCardValues] = React.useState<CreditCardFormValues>({
    cardNumber: cardValues.cardNumber ?? '',
    expiry: cardValues.expiry ?? '',
    cvc: cardValues.cvc ?? '',
  });

  React.useEffect(() => {
    if (showCardForm && Object.keys(cardValues).length > 0) {
      setLocalCardValues((prev) => ({
        ...prev,
        ...cardValues,
      }));
    }
  }, [showCardForm, cardValues.cardNumber, cardValues.expiry, cardValues.cvc]);

  const handleCardChange = React.useCallback(
    (values: CreditCardFormValues) => {
      setLocalCardValues(values);
      onCardChange?.(values);
    },
    [onCardChange]
  );

  const handleSaveCard = React.useCallback(() => {
    onSaveCard?.(localCardValues);
  }, [localCardValues, onSaveCard]);

  return (
    <FormSectionCard title={title} className={className}>
      <div className="space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Manage your payment methods for subscriptions and invoices.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={onAddNewCard}
            disabled={isAdding}
            className="w-full sm:w-auto"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add New Card
          </Button>
        </div>

        {showCardForm && (
          <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-5 dark:border-gray-800 dark:bg-gray-800/30">
            <FormCreditCard
              namePrefix="paymentMethod"
              values={localCardValues}
              onChange={handleCardChange}
              required
            />
            <div className="mt-5 flex gap-3">
              <Button type="button" onClick={handleSaveCard}>
                Save Card
              </Button>
              {onCancelAddCard && (
                <Button type="button" variant="outline" onClick={onCancelAddCard}>
                  Cancel
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </FormSectionCard>
  );
}
