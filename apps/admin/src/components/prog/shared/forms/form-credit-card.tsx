'use client';

import * as React from 'react';
import cardValidator from 'card-validator';
import { FormInput } from './form-input';
import { FormPaymentInput, type CardType } from './form-payment-input';
import { Alert } from "@uprise/ui";

export interface CreditCardFormValues {
  cardNumber: string;
  expiry: string;
  cvc: string;
}

export interface CreditCardFormErrors {
  cardNumber?: string;
  expiry?: string;
  cvc?: string;
}

export interface FormCreditCardProps {
  /** Optional field name prefix for form submission */
  namePrefix?: string;
  /** Controlled values */
  values?: Partial<CreditCardFormValues>;
  /** Change handler for controlled mode */
  onChange?: (values: CreditCardFormValues) => void;
  /** Whether all fields are required */
  required?: boolean;
  /** Additional class for the container */
  className?: string;
  /** Submit/API error message - shown in Alert */
  submitError?: string;
}

export interface FormCreditCardRef {
  validate: () => boolean;
  getValues: () => CreditCardFormValues;
}

function formatCardNumber(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 16);
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}

function formatExpiry(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  if (digits.length >= 2) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }
  return digits;
}

/** Restrict expiry input: month 01-12, year current to current+20 */
function filterExpiryDigits(input: string): string {
  const digits = input.replace(/\D/g, '');
  const now = new Date();
  const currentYear = now.getFullYear() % 100;
  const maxYear = (now.getFullYear() + 20) % 100;
  const minTens = Math.floor(currentYear / 10);
  const maxTens = Math.floor(maxYear / 10);
  const minOnes = currentYear % 10;
  const maxOnes = maxYear % 10;

  let result = '';
  for (let i = 0; i < digits.length && result.length < 4; i++) {
    const d = digits[i];
    const n = parseInt(d, 10);
    if (result.length === 0) {
      if (d === '0' || d === '1') result += d;
    } else if (result.length === 1) {
      const first = result[0];
      if (first === '0' && n >= 1 && n <= 9) result += d;
      else if (first === '1' && (n === 0 || n === 1 || n === 2)) result += d;
    } else if (result.length === 2) {
      if (n >= minTens && n <= maxTens) result += d;
    } else if (result.length === 3) {
      const yearTens = parseInt(result[2], 10);
      const yearOnes = n;
      const yy = yearTens * 10 + yearOnes;
      if (yy >= currentYear && yy <= maxYear) {
        if (yearTens === minTens && yearTens === maxTens) {
          if (yearOnes >= minOnes && yearOnes <= maxOnes) result += d;
        } else if (yearTens === minTens) {
          if (yearOnes >= minOnes) result += d;
        } else if (yearTens === maxTens) {
          if (yearOnes <= maxOnes) result += d;
        } else {
          result += d;
        }
      }
    }
  }
  return result;
}

function getCardTypeFromNumber(cardNumber: string): CardType | null {
  const digits = cardNumber.replace(/\D/g, '');
  if (digits.length < 4) return null;
  const validation = cardValidator.number(cardNumber);
  const type = validation.card?.type;
  if (type === 'visa' || type === 'mastercard' || type === 'discover') return type;
  if (type === 'american-express') return 'amex';
  return null;
}

function validateCardNumber(value: string): string | undefined {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 0) return 'Card number is required';
  if (digits.length < 13) return 'Card number is too short';
  const validation = cardValidator.number(value);
  if (!validation.isValid) return 'Invalid card number';
  return undefined;
}

function validateExpiry(value: string): string | undefined {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 0) return 'Expiry is required';
  if (digits.length < 4) return 'Enter MM/YY';
  const mm = parseInt(digits.slice(0, 2), 10);
  const yy = parseInt(digits.slice(2, 4), 10);
  if (mm < 1 || mm > 12) return 'Invalid month';
  const now = new Date();
  const currentYear = now.getFullYear() % 100;
  const currentMonth = now.getMonth() + 1;
  const maxYear = (now.getFullYear() + 20) % 100;
  if (yy < currentYear || yy > maxYear) return 'Invalid expiry year';
  if (yy === currentYear && mm < currentMonth) return 'Card has expired';
  return undefined;
}

function validateCvc(value: string): string | undefined {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 0) return 'CVC is required';
  if (digits.length < 3) return 'CVC must be 3 or 4 digits';
  if (digits.length > 4) return 'CVC must be 3 or 4 digits';
  return undefined;
}

export const FormCreditCard = React.forwardRef<FormCreditCardRef, FormCreditCardProps>(function FormCreditCard({
  namePrefix = 'card',
  values = {},
  onChange,
  required = false,
  className = '',
  submitError = '',
}, ref) {
  const [cardNumber, setCardNumber] = React.useState(values.cardNumber ?? '');
  const [expiry, setExpiry] = React.useState(values.expiry ?? '');
  const [cvc, setCvc] = React.useState(values.cvc ?? '');
  const [errors, setErrors] = React.useState<CreditCardFormErrors>({});
  const [touched, setTouched] = React.useState({ cardNumber: false, expiry: false, cvc: false });

  const cardType = React.useMemo(() => getCardTypeFromNumber(cardNumber), [cardNumber]);

  React.useEffect(() => {
    if (onChange) {
      const rawCard = cardNumber.replace(/\D/g, '');
      const rawExpiry = expiry.replace(/\D/g, '');
      onChange({ cardNumber: rawCard, expiry: rawExpiry, cvc });
    }
  }, [cardNumber, expiry, cvc, onChange]);

  React.useEffect(() => {
    if (values.cardNumber !== undefined) setCardNumber(formatCardNumber(values.cardNumber));
    if (values.expiry !== undefined) setExpiry(formatExpiry(values.expiry));
    if (values.cvc !== undefined) setCvc(values.cvc);
  }, [values.cardNumber, values.expiry, values.cvc]);

  const runValidation = React.useCallback(() => {
    const cardErr = validateCardNumber(cardNumber);
    const expiryErr = validateExpiry(expiry);
    const cvcErr = validateCvc(cvc);
    setErrors({
      cardNumber: cardErr,
      expiry: expiryErr,
      cvc: cvcErr,
    });
    return !cardErr && !expiryErr && !cvcErr;
  }, [cardNumber, expiry, cvc]);

  const validate = React.useCallback((): boolean => {
    setTouched({ cardNumber: true, expiry: true, cvc: true });
    return runValidation();
  }, [runValidation]);

  const getValues = React.useCallback((): CreditCardFormValues => ({
    cardNumber: cardNumber.replace(/\D/g, ''),
    expiry: expiry.replace(/\D/g, ''),
    cvc,
  }), [cardNumber, expiry, cvc]);

  React.useImperativeHandle(ref, () => ({ validate, getValues }), [validate, getValues]);

  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 16);
    setCardNumber(formatCardNumber(digits));
    if (errors.cardNumber) setErrors((prev) => ({ ...prev, cardNumber: undefined }));
  };

  const handleCardNumberBlur = () => {
    setTouched((prev) => ({ ...prev, cardNumber: true }));
    const err = validateCardNumber(cardNumber);
    setErrors((prev) => ({ ...prev, cardNumber: err }));
  };

  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const filtered = filterExpiryDigits(e.target.value);
    setExpiry(formatExpiry(filtered));
    if (errors.expiry) setErrors((prev) => ({ ...prev, expiry: undefined }));
  };

  const handleExpiryBlur = () => {
    setTouched((prev) => ({ ...prev, expiry: true }));
    const err = validateExpiry(expiry);
    setErrors((prev) => ({ ...prev, expiry: err }));
  };

  const handleCvcChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 4);
    setCvc(digits);
    if (errors.cvc) setErrors((prev) => ({ ...prev, cvc: undefined }));
  };

  const handleCvcBlur = () => {
    setTouched((prev) => ({ ...prev, cvc: true }));
    const err = validateCvc(cvc);
    setErrors((prev) => ({ ...prev, cvc: err }));
  };

  return (
    <div className={`space-y-5 ${className}`}>
      {submitError && (
        <Alert variant="error" title="Error" message={submitError} />
      )}
      <FormPaymentInput
        id={`${namePrefix}.number`}
        name={`${namePrefix}.number`}
        label="Card number"
        placeholder="1234 5678 9012 3456"
        value={cardNumber}
        onChange={handleCardNumberChange}
        onBlur={handleCardNumberBlur}
        maxLength={19}
        cardType={cardType}
        error={touched.cardNumber ? errors.cardNumber : undefined}
        required={required}
      />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <FormInput
          id={`${namePrefix}.expiry`}
          name={`${namePrefix}.expiry`}
          label="Expiry"
          placeholder="MM/YY"
          value={expiry}
          onChange={handleExpiryChange}
          onBlur={handleExpiryBlur}
          maxLength={5}
          required={required}
          error={touched.expiry ? errors.expiry : undefined}
          state={touched.expiry && errors.expiry ? 'error' : 'default'}
        />
        <FormInput
          id={`${namePrefix}.cvc`}
          name={`${namePrefix}.cvc`}
          label="CVC"
          placeholder="123"
          type="text"
          inputMode="numeric"
          maxLength={4}
          value={cvc}
          onChange={handleCvcChange}
          onBlur={handleCvcBlur}
          required={required}
          error={touched.cvc ? errors.cvc : undefined}
          state={touched.cvc && errors.cvc ? 'error' : 'default'}
        />
      </div>
    </div>
  );
});

export type { CardType };
