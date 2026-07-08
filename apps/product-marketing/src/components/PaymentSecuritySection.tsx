"use client";

import Image from "next/image";

function ShieldCheckIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="21"
      viewBox="0 0 18 21"
      fill="none"
      className={className}
    >
      <path
        d="M1 5.16215C0.999991 4.56883 1.37313 4.03002 1.95492 3.78327L8.19338 1.13734C8.62515 0.954219 9.12143 0.954219 9.55319 1.13734L15.7917 3.78328C16.3735 4.03003 16.7466 4.56882 16.7466 5.16212L16.7467 10.6862C16.7467 12.1067 16.2773 13.496 15.3146 14.6008C13.5901 16.5796 10.6985 19.5488 8.87342 19.5488C7.04836 19.5488 4.1567 16.5795 2.43222 14.6007C1.46951 13.496 1.0001 12.1068 1.00008 10.6863L1 5.16215Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M11.85 8.09155L7.83812 11.8123L5.89648 10.0116"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function PaymentSecuritySection() {
  return (
    <section className="pt-10">
      <div className="mx-auto flex max-w-[584px] flex-col justify-center px-4 sm:px-5 xl:px-0">
        <div className="mx-auto mb-3 inline-flex max-w-max items-center">
          <span className="text-success-600 dark:text-success-500">
            <ShieldCheckIcon />
          </span>
          <p className="text-text-color-secondary -tracking-0.28 ml-4 text-sm font-medium dark:text-gray-400">
            Safe & secure payments, Powered by
          </p>
          <span className="bg-stroke mx-3 block h-4.5 w-px dark:bg-gray-700" />
          <Image
            src="/images/marketing/stripe-logo.svg"
            alt="Stripe"
            width={120}
            height={60}
            className="h-8 w-auto dark:brightness-0 dark:invert"
          />
        </div>
        <p className="text-text-color-secondary -tracking-0.28 mb-8 text-center text-sm dark:text-gray-400">
          We do not store any credit card information in server, payments are processed by gateways and site is secured by{" "}
          <span className="text-text-color dark:text-gray-200">128 bit SSL encryption.</span>
        </p>
        <p className="text-text-color-secondary mb-5 text-center text-sm font-medium dark:text-gray-400">
          Accepted Payment Methods
        </p>
      </div>
      <div className="mx-auto w-full max-w-[700px] px-4 sm:px-5 xl:px-0">
        <Image
          src="/images/marketing/payment-info.svg"
          alt="Accepted payment methods: Visa, Mastercard, American Express, and more"
          width={826}
          height={28}
          className="h-auto w-full dark:hidden"
        />
        <Image
          src="/images/marketing/payment-info-white.svg"
          alt="Accepted payment methods: Visa, Mastercard, American Express, and more"
          width={826}
          height={28}
          className="hidden h-auto w-full dark:block"
        />
      </div>
    </section>
  );
}
