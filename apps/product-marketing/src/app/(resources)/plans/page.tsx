"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { plans as plansApi, type PublicPlan } from "@uprise/api-client";
import FaqSection, { type FaqItem } from "@/components/FaqSection";
import PaymentSecuritySection from "@/components/PaymentSecuritySection";

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "Can I use Uprise for my organisation and campaigns?",
    answer:
      "Yes, Uprise is built for progressive organisations, nonprofits, and changemakers. You can use it for campaigns, member management, and outreach based on your plan.",
  },
  {
    question: "Do I get free updates?",
    answer:
      "Yes, you receive lifetime free updates without any additional cost. We will notify you when new features or improvements are available.",
  },
  {
    question: "Do you provide support?",
    answer:
      "Yes. Support is provided to all our customers. Please open a support ticket describing your issue. We'll respond within 24 hours.",
  },
  {
    question: "Is it a monthly or annual payment?",
    answer:
      "You can choose either. Pay monthly for flexibility, or save with annual billing. All plans include the same features regardless of billing cycle.",
  },
  {
    question: "Which plan is suitable for me?",
    answer:
      "Starter is ideal for small teams and local campaigns. Growth suits growing organisations and regional campaigns. Scale is for larger teams and multi-region operations. Compare the pricing table above to find the best fit.",
  },
  {
    question: "Can I upgrade to a higher plan?",
    answer:
      "Yes, you can upgrade to a higher plan at any time. Contact us via support and we'll help you transition smoothly.",
  },
  {
    question: 'What does "contacts" mean?',
    answer:
      "Contacts refer to the number of people in your audience database—supporters, members, or donors you can reach via email, SMS, or other channels.",
  },
  {
    question: 'What does "team members" mean?',
    answer:
      "Team members are the number of users who can access your Uprise account and collaborate on campaigns, audiences, and reporting.",
  },
  {
    question: "What are segments?",
    answer:
      "Segments let you organise your contacts into groups based on criteria like location, interests, or engagement history. Use them to target campaigns more effectively.",
  },
  {
    question: 'What does "all channels" mean?',
    answer:
      "All channels includes email, SMS, and phone calls. The Scale plan unlocks full multi-channel outreach for comprehensive campaign reach.",
  },
  {
    question: "What is multi-tenant & multi-brand?",
    answer:
      "It lets you run many campaigns, brands or partner organisations from one account, each with its own isolated data and a branded, white-label portal (logo, colours, custom CSS and subdomain). It's included on the Scale plan – see the Campaigners page for detail.",
  },
];

function CheckIcon() {
  return (
    <svg
      className="h-6 w-6 text-success-500 max-md:h-5 max-md:w-5"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12ZM16.0303 8.96967C16.3232 9.26256 16.3232 9.73744 16.0303 10.0303L11.0303 15.0303C10.7374 15.3232 10.2626 15.3232 9.96967 15.0303L7.96967 13.0303C7.67678 12.7374 7.67678 12.2626 7.96967 11.9697C8.26256 11.6768 8.73744 11.6768 9.03033 11.9697L10.5 13.4393L12.7348 11.2045L14.9697 8.96967C15.2626 8.67678 15.7374 8.67678 16.0303 8.96967Z"
        fill="currentColor"
      />
    </svg>
  );
}

function DashIcon() {
  return (
    <svg
      className="h-6 w-6 text-gray-300 max-md:h-5 max-md:w-5"
      viewBox="0 0 24 4"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M2 2H22.0007"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formatLimit(value: number | null | undefined): string {
  if (value === null || value === undefined) return "Unlimited";
  return value >= 1000 ? `Up to ${value.toLocaleString()}` : String(value);
}

/** Savings % between an original and a current price (0 if no discount). */
function savingsPercent(price: number | null, original: number | null): number {
  if (!price || !original || original <= price) return 0;
  return Math.round((1 - price / original) * 100);
}

export default function PlansPage() {
  const [monthly, setMonthly] = useState(true);
  const [plans, setPlans] = useState<PublicPlan[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void plansApi.listPublic().then((res) => {
      if (!live) return;
      if (res.ok) setPlans([...res.data].sort((a, b) => a.order - b.order));
      else setError(res.error);
    });
    return () => {
      live = false;
    };
  }, []);

  // The feature-table rows: the three usage limits, then the union of feature
  // labels across plans (preserving first-seen order so all plans share columns).
  const featureLabels = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const p of plans ?? []) {
      for (const f of p.features ?? []) {
        if (!seen.has(f.label)) {
          seen.add(f.label);
          out.push(f.label);
        }
      }
    }
    return out;
  }, [plans]);

  const cols = (plans?.length ?? 0) + 1;
  const gridStyle = { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` } as const;

  function priceFor(plan: PublicPlan) {
    const price = monthly ? plan.priceMonthly : plan.priceAnnually;
    const original = monthly ? plan.priceMonthlyOriginal : plan.priceAnnuallyOriginal;
    return { price, original };
  }

  function featureValue(plan: PublicPlan, label: string): boolean | string | undefined {
    return plan.features?.find((f) => f.label === label)?.value;
  }

  return (
    <main>
      <section className="pb-5 pt-17.5">
        <div className="container">
          <div className="mx-auto mb-5 w-full max-w-[770px] text-center lg:mb-0">
            <h1 className="pt-17.5 mb-4 text-3xl font-bold !leading-[1.2] text-title-color md:text-[40px]">
              Flexible Plans Tailored to Fit Your Unique Needs
            </h1>
            <p className="text-base text-text-color-secondary">
              Choose the plan that fits your organisation. Pay monthly or save
              with annual billing.
            </p>
          </div>
        </div>

        <div className="container flex flex-col items-center">
          <div className="mt-11 flex w-full justify-center lg:mt-16">
            <div className="relative inline-flex flex-wrap items-center justify-center gap-1 rounded-full bg-gray-100 p-1">
              <button
                onClick={() => setMonthly(true)}
                className={`cursor-pointer inline-flex items-center gap-2 rounded-full px-5 py-3 text-base font-medium ${
                  monthly
                    ? "bg-white text-text-color shadow-theme-sm"
                    : "text-text-color-secondary hover:bg-white hover:text-text-color"
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setMonthly(false)}
                className={`cursor-pointer inline-flex items-center gap-2 rounded-full px-5 py-3 text-base font-medium ${
                  !monthly
                    ? "bg-white text-text-color shadow-theme-sm"
                    : "text-text-color-secondary hover:bg-white hover:text-text-color"
                }`}
              >
                Annually
              </button>
            </div>
          </div>

          {error ? (
            <p className="mt-11 text-base text-text-color-secondary">
              Pricing is unavailable right now. Please try again shortly.
            </p>
          ) : plans === null ? (
            <div className="mt-11 h-64 w-full max-w-[770px] animate-pulse rounded-3xl bg-gray-100" />
          ) : plans.length === 0 ? (
            <p className="mt-11 text-base text-text-color-secondary">No plans available.</p>
          ) : (
            <div className="mt-11 w-full rounded-3xl border border-stroke bg-white">
              <div className="w-full overflow-x-auto">
                <div className="grid border-stroke max-lg:m-4 max-lg:gap-4 lg:border-b" style={gridStyle}>
                  <div className="p-7 pb-8 max-lg:rounded-2xl max-lg:border">
                    <p className="text-base text-text-color">
                      Uprise plans for progressive organisations
                    </p>
                  </div>

                  {plans.map((plan) => {
                    const { price, original } = priceFor(plan);
                    const saving = savingsPercent(price, original);
                    return (
                      <div
                        key={plan.id}
                        className="relative border-l border-stroke max-lg:rounded-2xl max-lg:border z-10"
                      >
                        {plan.popular && (
                          <div className="absolute -z-10 h-full w-full bg-[linear-gradient(180deg,#ECF3FF_0%,rgba(236,243,255,0.00)_21.53%)] max-lg:rounded-2xl" />
                        )}
                        <div className="flex h-full flex-col justify-between px-8 pb-8 pt-7 max-md:px-5 lg:px-6 xl:px-8">
                          <div className="relative z-10 flex-1">
                            <div className="mb-5 flex flex-wrap items-center gap-2">
                              <p className="text-xl font-semibold text-text-color">
                                {plan.displayName}
                              </p>
                              {plan.popular ? (
                                <span className="inline-flex h-5.5 items-center justify-center whitespace-nowrap rounded-full bg-brand-100 px-2 text-xs font-medium text-brand-500">
                                  Popular
                                </span>
                              ) : saving > 0 ? (
                                <span className="inline-flex h-5.5 items-center justify-center whitespace-nowrap rounded-full bg-success-50 px-2 text-xs font-medium text-success-600">
                                  Saving {saving}%
                                </span>
                              ) : null}
                            </div>
                            <div className="mb-2.5">
                              <p className="flex items-center gap-2">
                                {original && original > (price ?? 0) ? (
                                  <span className="text-[26px] font-medium text-dark-4 line-through">
                                    ${original}
                                  </span>
                                ) : null}
                                <span className="text-4xl font-bold text-text-color">
                                  ${price ?? 0}
                                </span>
                              </p>
                            </div>
                            <p className="mb-1 text-base font-medium text-text-color">
                              per {monthly ? "month" : "year"}
                            </p>
                            <p className="mb-5 text-base text-text-color-tertiary">
                              {plan.description}
                            </p>
                          </div>
                          <Link
                            href="/sign-up"
                            className="flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-brand-500 px-5 py-3.5 text-sm font-medium text-white duration-200 hover:bg-brand-600 sm:text-base lg:gap-1 lg:px-2 lg:text-sm xl:gap-2 xl:px-5 xl:text-base"
                          >
                            <span>Choose {plan.displayName}</span>
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div
                  className="grid rounded-lg text-center text-sm font-medium *:px-7 *:py-3.5 *:text-text-color-secondary max-lg:hidden"
                  style={gridStyle}
                >
                  <p className="text-left">Key Features</p>
                  {plans.map((plan) => (
                    <p key={plan.id} className="border-l border-stroke">
                      {plan.displayName}
                    </p>
                  ))}
                </div>

                {/* Usage limits */}
                {[
                  { label: "Contacts", get: (p: PublicPlan) => formatLimit(p.limits?.contacts) },
                  { label: "Team members", get: (p: PublicPlan) => formatLimit(p.limits?.teamMembers) },
                  { label: "Segments", get: (p: PublicPlan) => formatLimit(p.limits?.segments) },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="flex grid-cols-4 border-t border-stroke text-center text-xs font-medium *:px-2 *:py-2.5 *:text-text-color sm:text-sm md:text-base md:*:px-7 md:*:py-6 lg:grid"
                    style={gridStyle}
                  >
                    <p className="flex gap-3 text-left max-xl:w-full">{row.label}</p>
                    {plans.map((plan) => (
                      <p
                        key={plan.id}
                        className="border-l border-stroke max-xl:min-w-40 max-md:min-w-32 max-sm:min-w-20"
                      >
                        {row.get(plan)}
                      </p>
                    ))}
                  </div>
                ))}

                {/* Feature ticks */}
                {featureLabels.map((label) => (
                  <div
                    key={label}
                    className="flex grid-cols-4 border-t border-stroke text-center text-xs font-medium *:px-2 *:py-2.5 *:text-text-color sm:text-sm md:text-base md:*:px-7 md:*:py-6 lg:grid"
                    style={gridStyle}
                  >
                    <p className="flex gap-3 text-left max-xl:w-full">{label}</p>
                    {plans.map((plan) => {
                      const v = featureValue(plan, label);
                      if (typeof v === "string") {
                        return (
                          <p
                            key={plan.id}
                            className="border-l border-stroke max-xl:min-w-40 max-md:min-w-32 max-sm:min-w-20"
                          >
                            {v}
                          </p>
                        );
                      }
                      return (
                        <div
                          key={plan.id}
                          className="flex items-center justify-center border-l border-stroke max-xl:min-w-40 max-md:min-w-32 max-sm:min-w-20"
                        >
                          {v ? <CheckIcon /> : <DashIcon />}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
      <PaymentSecuritySection />
      <FaqSection
        subtitle="Answered all frequently asked questions. Still confused? Feel free to open a support ticket."
        items={FAQ_ITEMS}
      />
    </main>
  );
}
