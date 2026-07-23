'use client';

import * as React from 'react';
import { CreditCard } from 'lucide-react';
import { FormField, inputBaseClasses } from './form-field';
import { cn } from "@uprise/ui";

export type CardType = 'visa' | 'mastercard' | 'amex' | 'discover';

function CardTypeLogo({ cardType }: { cardType?: CardType | null }) {
  switch (cardType) {
    case 'visa':
      return (
        <svg width="33" height="18" viewBox="0 0 33 18" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-5 w-auto">
          <g clipPath="url(#clip0_visa_logo)">
            <path d="M21.2243 3.90918C18.9651 3.90918 16.9462 5.06569 16.9462 7.20245C16.9462 9.65285 20.5268 9.82209 20.5268 11.0531C20.5268 11.5715 19.9254 12.0355 18.8981 12.0355C17.4403 12.0355 16.3507 11.3871 16.3507 11.3871L15.8844 13.5434C15.8844 13.5434 17.1396 14.091 18.8061 14.091C21.2762 14.091 23.2198 12.8777 23.2198 10.7045C23.2198 8.11511 19.6243 7.95089 19.6243 6.80831C19.6243 6.4022 20.118 5.95732 21.1423 5.95732C22.298 5.95732 23.2409 6.42885 23.2409 6.42885L23.6972 4.34631C23.6972 4.34631 22.6712 3.90918 21.2243 3.90918ZM0.554718 4.06638L0.5 4.38071C0.5 4.38071 1.45047 4.55249 2.3065 4.89522C3.40871 5.28816 3.48725 5.51692 3.67287 6.22747L5.69567 13.9289H8.40731L12.5848 4.06638H9.87935L7.19509 10.7719L6.09978 5.08798C5.99931 4.43747 5.49047 4.06638 4.86767 4.06638H0.554718ZM13.6726 4.06638L11.5503 13.9289H14.1301L16.245 4.06634L13.6726 4.06638ZM28.0612 4.06638C27.4391 4.06638 27.1095 4.39529 26.8676 4.97009L23.088 13.9289H25.7934L26.3168 12.4357H29.6128L29.9311 13.9289H32.3182L30.2357 4.06638H28.0612ZM28.413 6.73093L29.2149 10.4318H27.0665L28.413 6.73093Z" fill="#1434CB" />
          </g>
          <defs>
            <clipPath id="clip0_visa_logo">
              <rect width="32" height="17.4545" fill="white" transform="translate(0.5 0.272949)" />
            </clipPath>
          </defs>
        </svg>
      );
    case 'mastercard':
      return (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="6.25" cy="10" r="5.625" fill="#E80B26" />
          <circle cx="13.75" cy="10" r="5.625" fill="#F59D31" />
          <path
            d="M10 14.1924C11.1508 13.1625 11.875 11.6657 11.875 9.99979C11.875 8.33383 11.1508 6.8371 10 5.80713C8.84918 6.8371 8.125 8.33383 8.125 9.99979C8.125 11.6657 8.84918 13.1625 10 14.1924Z"
            fill="#FC6020"
          />
        </svg>
      );
    case 'amex':
      return (
        <svg width="33" height="20" viewBox="0 0 33 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-5 w-auto">
          <path d="M0 4C0 2.89543 0.89543 2 2 2H31C32.1046 2 33 2.89543 33 4V16C33 17.1046 32.1046 18 31 18H2C0.89543 18 0 17.1046 0 16V4Z" fill="#006FCF" />
          <path d="M16.5 10L20 14H17L15.5 12L14 14H11L14.5 10L11 6H14L15.5 8L17 6H20L16.5 10Z" fill="white" />
        </svg>
      );
    case 'discover':
      return (
        <svg width="33" height="20" viewBox="0 0 33 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-5 w-auto">
          <rect width="33" height="20" rx="2" fill="#1A1F71" />
          <path d="M8 6H25V14H8V6Z" fill="white" fillOpacity="0.9" />
        </svg>
      );
    default:
      return <CreditCard className="h-5 w-5 text-gray-500 dark:text-gray-400" />;
  }
}

export interface FormPaymentInputProps extends Omit<React.ComponentProps<'input'>, 'className'> {
  label: string;
  id?: string;
  className?: string;
  /** Card type for dynamic logo (visa, mastercard, amex, discover) */
  cardType?: CardType | null;
  error?: string;
  required?: boolean;
}

export function FormPaymentInput({ label, id, className, cardType, error, required, ...props }: FormPaymentInputProps) {
  const inputId = id ?? `payment-${Math.random().toString(36).slice(2)}`;

  return (
    <FormField label={label} htmlFor={inputId} error={error} required={required}>
      <div className="relative">
        <input
          id={inputId}
          type="text"
          className={cn(inputBaseClasses, 'appearance-none bg-none pl-[62px]', className)}
          {...props}
        />
        <span className="absolute top-1/2 left-0 flex h-11 w-[46px] -translate-y-1/2 items-center justify-center border-r border-gray-200 dark:border-gray-800">
          <CardTypeLogo cardType={cardType} />
        </span>
      </div>
    </FormField>
  );
}
