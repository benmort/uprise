'use client';

import { useState } from 'react';
import Link from 'next/link';
import Breadcrumbs from '@/components/prog/shared/breadcrumbs';
import PaymentSecuritySection from '@/components/prog/shared/PaymentSecuritySection';

function CheckIcon({ stroke = '#12B76A' }: { stroke?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M13.4017 4.35986L6.12166 11.6399L2.59833 8.11657" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg width="17" height="16" viewBox="0 0 17 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path fillRule="evenodd" clipRule="evenodd" d="M4.05394 4.78033C3.76105 4.48744 3.76105 4.01256 4.05394 3.71967C4.34684 3.42678 4.82171 3.42678 5.1146 3.71967L8.33437 6.93944L11.5521 3.72173C11.845 3.42883 12.3199 3.42883 12.6127 3.72173C12.9056 4.01462 12.9056 4.48949 12.6127 4.78239L9.39503 8.0001L12.6127 11.2178C12.9056 11.5107 12.9056 11.9856 12.6127 12.2785C12.3198 12.5713 11.845 12.5713 11.5521 12.2785L8.33437 9.06076L5.11462 12.2805C4.82173 12.5734 4.34685 12.5734 4.05396 12.2805C3.76107 11.9876 3.76107 11.5127 4.05396 11.2199L7.27371 8.0001L4.05394 4.78033Z" fill="#98A2B3" />
    </svg>
  );
}

function FeatureItem({ children, included = true, light = false }: { children: React.ReactNode; included?: boolean; light?: boolean }) {
  const textClass = !included
    ? 'text-gray-400'
    : light
      ? 'text-white/80'
      : 'text-gray-500 dark:text-gray-400';

  return (
    <p className={`flex items-center gap-3 text-sm ${textClass}`}>
      {included ? <CheckIcon stroke={light ? 'white' : '#12B76A'} /> : <CrossIcon />}
      {children}
    </p>
  );
}

function PersonIcon() {
  return (
    <span className="flex h-14 w-14 items-center justify-center rounded-[10.5px] bg-brand-50 text-brand-500">
      <svg className="fill-current" width="29" height="28" viewBox="0 0 29 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path fillRule="evenodd" clipRule="evenodd" d="M11.4072 8.64984C11.4072 6.77971 12.9232 5.26367 14.7934 5.26367C16.6635 5.26367 18.1795 6.77971 18.1795 8.64984C18.1795 10.52 16.6635 12.036 14.7934 12.036C12.9232 12.036 11.4072 10.52 11.4072 8.64984ZM14.7934 3.48633C11.9416 3.48633 9.62986 5.79811 9.62986 8.64984C9.62986 11.5016 11.9416 13.8133 14.7934 13.8133C17.6451 13.8133 19.9569 11.5016 19.9569 8.64984C19.9569 5.79811 17.6451 3.48633 14.7934 3.48633ZM12.8251 15.6037C8.49586 15.6037 4.98632 19.1133 4.98632 23.4425V23.847C4.98632 24.3378 5.38419 24.7357 5.87499 24.7357C6.36579 24.7357 6.76366 24.3378 6.76366 23.847V23.4425C6.76366 20.0949 9.47746 17.3811 12.8251 17.3811H16.7635C20.1111 17.3811 22.8249 20.0949 22.8249 23.4425V23.847C22.8249 24.3378 23.2228 24.7357 23.7136 24.7357C24.2044 24.7357 24.6023 24.3378 24.6023 23.847V23.4425C24.6023 19.1133 21.0927 15.6037 16.7635 15.6037H12.8251Z" fill="" />
      </svg>
    </span>
  );
}

function BriefcaseIcon() {
  return (
    <span className="flex h-14 w-14 items-center justify-center rounded-[10.5px] bg-brand-50 text-brand-500">
      <svg className="fill-current" width="29" height="28" viewBox="0 0 29 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path fillRule="evenodd" clipRule="evenodd" d="M12.2969 3.55469C10.8245 3.55469 9.6309 4.7483 9.6309 6.2207V7.10938H6.29462C4.82222 7.10938 3.6286 8.30299 3.6286 9.77539V20.4395C3.6286 21.9119 4.82222 23.1055 6.29462 23.1055H23.4758C24.9482 23.1055 26.1419 21.9119 26.1419 20.4395V9.77539C26.1419 8.30299 24.9482 7.10938 23.4758 7.10938H19.7025V6.2207C19.7025 4.7483 18.5089 3.55469 17.0365 3.55469H12.2969ZM18.8148 8.88672H10.5186H6.29462C5.80382 8.88672 5.40595 9.28459 5.40595 9.77539V10.9666L14.5355 14.8792C14.759 14.975 15.012 14.975 15.2356 14.8792L24.3645 10.9669V9.77539C24.3645 9.28459 23.9666 8.88672 23.4758 8.88672H18.8148ZM17.9252 7.10938V6.2207C17.9252 5.7299 17.5273 5.33203 17.0365 5.33203H12.2969C11.8061 5.33203 11.4082 5.7299 11.4082 6.2207V7.10938H17.9252ZM5.40595 20.4395V12.9003L13.8353 16.5129C14.506 16.8003 15.2651 16.8003 15.9357 16.5129L24.3645 12.9006V20.4395C24.3645 20.9303 23.9666 21.3281 23.4758 21.3281H6.29462C5.80382 21.3281 5.40595 20.9303 5.40595 20.4395Z" fill="" />
      </svg>
    </span>
  );
}

function StarIcon() {
  return (
    <span className="flex h-14 w-14 items-center justify-center rounded-[10.5px] bg-brand-50 text-brand-500">
      <svg className="fill-current" width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path fillRule="evenodd" clipRule="evenodd" d="M23.7507 1.28757C24.0978 0.940553 24.6605 0.940611 25.0075 1.28769C25.3545 1.63478 25.3544 2.19745 25.0074 2.54447L19.8787 7.67208C19.5316 8.0191 18.9689 8.01904 18.6219 7.67195C18.2749 7.32487 18.275 6.76219 18.622 6.41518L23.7507 1.28757ZM19.4452 3.1553C19.7922 2.80822 19.7921 2.24554 19.4451 1.89853C19.098 1.55151 18.5353 1.55157 18.1883 1.89866L16.4386 3.64866C16.0916 3.99574 16.0917 4.55842 16.4388 4.90543C16.7859 5.25244 17.3485 5.25238 17.6955 4.9053L19.4452 3.1553ZM13.8188 4.02442C13.6691 3.72109 13.3602 3.52905 13.0219 3.52905C12.6837 3.52905 12.3747 3.72109 12.225 4.02442L9.39921 9.75015L3.08049 10.6683C2.74574 10.717 2.46763 10.9514 2.3631 11.2731C2.25857 11.5948 2.34575 11.948 2.58797 12.1841L7.16024 16.641L6.08087 22.9342C6.02369 23.2676 6.16075 23.6045 6.43441 23.8033C6.70807 24.0022 7.07088 24.0284 7.37029 23.871L13.0219 20.8997L18.6736 23.871C18.973 24.0284 19.3358 24.0022 19.6094 23.8033C19.8831 23.6045 20.0202 23.2676 19.963 22.9342L18.8836 16.641L23.4559 12.1841C23.6981 11.948 23.7853 11.5948 23.6807 11.2731C23.5762 10.9514 23.2981 10.717 22.9634 10.6683L16.6446 9.75015L13.8188 4.02442ZM10.7862 10.9557L13.0219 6.42572L15.2576 10.9557C15.387 11.218 15.6373 11.3998 15.9267 11.4418L20.9258 12.1683L17.3084 15.6944C17.099 15.8985 17.0034 16.1927 17.0529 16.4809L17.9068 21.4599L13.4355 19.1091C13.1766 18.973 12.8673 18.973 12.6084 19.1091L8.13703 21.4599L8.99098 16.4809C9.04043 16.1927 8.94485 15.8985 8.7354 15.6944L5.118 12.1683L10.1171 11.4418C10.4066 11.3998 10.6568 11.218 10.7862 10.9557ZM25.2694 5.97276C25.6165 6.31978 25.6166 6.88245 25.2696 7.22954L23.5199 8.97954C23.1729 9.32662 22.6102 9.32668 22.2632 8.97967C21.9161 8.63265 21.916 8.06998 22.263 7.72289L24.0127 5.97289C24.3597 5.62581 24.9224 5.62575 25.2694 5.97276Z" fill="" />
      </svg>
    </span>
  );
}

function PlanTableOne() {
  const [monthly, setMonthly] = useState(true);
  const currentPlan = 'Growth';

  const plans = [
    {
      name: 'Starter',
      price: monthly ? '$49' : '$499',
      oldPrice: monthly ? '$59' : '$708',
      description: 'For small teams and local campaigns',
      features: ['Up to 5,000 contacts', '3 team members', '5 segments', 'Email campaigns', 'Forms & petitions', 'Basic reporting'],
      highlighted: false,
    },
    {
      name: 'Growth',
      price: monthly ? '$149' : '$1,599',
      oldPrice: monthly ? '$179' : '$2,148',
      description: 'For growing organisations and regional campaigns',
      features: ['Up to 25,000 contacts', '10 team members', '20 segments', 'Email + SMS campaigns', 'Surveys & fundraisers', 'Advanced analytics'],
      highlighted: true,
    },
    {
      name: 'Scale',
      price: monthly ? '$298' : '$3,199',
      oldPrice: monthly ? '$358' : '$4,296',
      description: 'For larger teams and multi-region operations',
      features: ['Up to 100,000 contacts', '25 team members', 'Unlimited segments', 'All channels (email, calls, SMS)', 'Grant management', 'API access & priority support'],
      highlighted: false,
    },
  ];

  const handleChoosePlan = (_planName: string) => {};

  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className=" border-gray-100 p-4 dark:border-gray-800 sm:p-6">
        <div className="mx-auto w-full max-w-[385px]">
          <h2 className="mb-7 text-center text-lg font-bold text-gray-800 dark:text-white/90">
            Flexible Plans Tailored to Fit Your Unique Needs!
          </h2>
          {currentPlan && (
            <p className="mb-4 text-center text-sm text-gray-500 dark:text-gray-400">
              Current Plan: <span className="font-medium text-gray-700 dark:text-gray-300">{currentPlan}</span>
            </p>
          )}
        </div>

        {/* Toggle */}
        <div className="mb-10 text-center">
          <div className="relative z-[1] mx-auto inline-flex rounded-full bg-gray-200 p-1 dark:bg-gray-800">
            <span
              className={`absolute top-1/2 -z-[1] flex h-11 w-[120px] -translate-y-1/2 rounded-full bg-white shadow-theme-xs duration-200 ease-linear dark:bg-white/10 ${
                monthly ? 'translate-x-0' : 'translate-x-full'
              }`}
            />
            <button
              className={`flex h-11 w-[120px] items-center justify-center text-base font-medium ${
                monthly ? 'text-gray-800 dark:text-white/90' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white/70'
              }`}
              onClick={() => setMonthly(true)}
            >
              Monthly
            </button>
            <button
              className={`flex h-11 w-[120px] items-center justify-center text-base font-medium ${
                !monthly ? 'text-gray-800 dark:text-white/90' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white/80'
              }`}
              onClick={() => setMonthly(false)}
            >
              Annually
            </button>
          </div>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 xl:gap-6">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-2xl p-6 ${
                plan.highlighted
                  ? 'border border-gray-800 bg-gray-800 dark:border-white/10 dark:bg-white/10'
                  : 'border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]'
              }`}
            >
              <span className={`mb-3 block text-xl font-semibold ${plan.highlighted ? 'text-white' : 'text-gray-800 dark:text-white/90'}`}>
                {plan.name}
              </span>

              <div className="mb-1 flex items-center justify-between">
                <div className="flex items-end">
                  <h2 className={`text-3xl font-bold ${plan.highlighted ? 'text-white' : 'text-gray-800 dark:text-white/90'}`}>
                    {plan.price}
                  </h2>
                  <span className={`mb-1 inline-block text-sm ${plan.highlighted ? 'text-white/70' : 'text-gray-500 dark:text-gray-400'}`}>
                    /{monthly ? 'month' : 'year'}
                  </span>
                </div>
                <span className={`text-xl font-semibold line-through ${plan.highlighted ? 'text-gray-300' : 'text-gray-400'}`}>
                  {plan.oldPrice}
                </span>
              </div>

              <p className={`text-sm ${plan.highlighted ? 'text-white/70' : 'text-gray-500 dark:text-gray-400'}`}>
                {plan.description}
              </p>

              <div className={`my-6 h-px w-full ${plan.highlighted ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-800'}`} />

              <div className="mb-8 space-y-3">
                {plan.features.map((feature) => (
                  <FeatureItem key={feature} light={plan.highlighted}>{feature}</FeatureItem>
                ))}
              </div>

              {currentPlan === plan.name ? (
                <Link
                  href="/admin/billing"
                  className="flex w-full items-center justify-center rounded-lg border border-gray-300 bg-white p-3.5 text-sm font-medium text-gray-600 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-white/5 dark:text-gray-400 dark:hover:bg-white/10"
                >
                  Current Plan
                </Link>
              ) : (
                <button
                  onClick={() => handleChoosePlan(plan.name)}
                  className={`flex w-full cursor-pointer items-center justify-center rounded-lg p-3.5 text-sm font-medium text-white shadow-theme-xs transition-colors disabled:opacity-50 ${
                    plan.highlighted
                      ? 'bg-brand-500 hover:bg-brand-600'
                      : 'bg-gray-800 hover:bg-brand-500 dark:bg-white/10'
                  }`}
                >
                  Choose {plan.name}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PlanTableTwo() {
  const plans = [
    {
      name: 'Personal',
      price: '$59.00',
      period: '/ Lifetime',
      description: 'For solo designers & freelancers',
      icon: <PersonIcon />,
      features: [
        { text: '5 website', included: true },
        { text: '500 MB Storage', included: true },
        { text: 'Unlimited Sub-Domain', included: true },
        { text: '3 Custom Domain', included: true },
        { text: 'Free SSL Certificate', included: false },
        { text: 'Unlimited Traffic', included: false },
      ],
      highlighted: false,
      buttonText: 'Choose Starter',
    },
    {
      name: 'Professional',
      price: '$199.00',
      period: '/ Lifetime',
      description: 'For working on commercial projects',
      icon: <BriefcaseIcon />,
      features: [
        { text: '10 website', included: true },
        { text: '1 GB Storage', included: true },
        { text: 'Unlimited Sub-Domain', included: true },
        { text: '5 Custom Domain', included: true },
        { text: 'Free SSL Certificate', included: true },
        { text: 'Unlimited Traffic', included: false },
      ],
      highlighted: true,
      buttonText: 'Choose This Plan',
    },
    {
      name: 'Enterprise',
      price: '$599.00',
      period: '/ Lifetime',
      description: 'For teams larger than 5 members',
      icon: <StarIcon />,
      features: [
        { text: '15 website', included: true },
        { text: '10 GB Storage', included: true },
        { text: 'Unlimited Sub-Domain', included: true },
        { text: '10 Custom Domain', included: true },
        { text: 'Free SSL Certificate', included: true },
        { text: 'Unlimited Traffic', included: true },
      ],
      highlighted: false,
      buttonText: 'Choose This Plan',
    },
  ];

  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="px-5 py-4 sm:px-6 sm:py-5">
        <h3 className="text-base font-medium text-gray-800 dark:text-white/90">Plan Table 2</h3>
      </div>
      <div className="border-t border-gray-100 p-4 dark:border-gray-800 sm:p-6">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 xl:gap-6">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-2xl p-6 xl:p-8 ${
                plan.highlighted
                  ? 'border-2 border-brand-500 bg-white dark:border-brand-500 dark:bg-white/[0.03]'
                  : 'border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]'
              }`}
            >
              <div className="-mb-4 flex items-start justify-between">
                <span className="block text-xl font-semibold text-gray-800 dark:text-white/90">{plan.name}</span>
                {plan.icon}
              </div>

              <div className="flex items-end">
                <h2 className="text-3xl font-bold text-gray-800 dark:text-white/90">{plan.price}</h2>
                <span className="mb-1 inline-block text-sm text-gray-500 dark:text-gray-400">{plan.period}</span>
              </div>

              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{plan.description}</p>

              <div className="my-6 h-px w-full bg-gray-200 dark:bg-gray-800" />

              <div className="mb-8 space-y-3">
                {plan.features.map((feature) => (
                  <FeatureItem key={feature.text} included={feature.included}>
                    {feature.text}
                  </FeatureItem>
                ))}
              </div>

              <button
                className={`flex w-full cursor-pointer items-center justify-center rounded-lg p-3.5 text-sm font-medium text-white shadow-theme-xs transition-colors ${
                  plan.highlighted
                    ? 'bg-brand-500 hover:bg-brand-600'
                    : 'bg-gray-800 hover:bg-brand-500 dark:bg-white/10'
                }`}
              >
                {plan.buttonText}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PlanTableThree() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="px-5 py-4 sm:px-6 sm:py-5">
        <h3 className="text-base font-medium text-gray-800 dark:text-white/90">Plan Table 3</h3>
      </div>
      <div className="border-t border-gray-100 p-4 dark:border-gray-800 sm:p-6">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 xl:gap-3 2xl:grid-cols-4">
          {/* Personal - Free */}
          <div>
            <div className="rounded-2xl bg-white p-6 dark:bg-white/[0.03]">
              <span className="block text-xl font-semibold text-gray-800 dark:text-white/90">Personal</span>
              <p className="mb-4 mt-1 text-sm text-gray-500 dark:text-gray-400">Perfect plan for Starters</p>
              <h2 className="mb-0.5 text-lg font-bold text-gray-800 dark:text-white/90">Free</h2>
              <span className="mb-6 inline-block text-sm text-gray-500 dark:text-gray-400">For a Lifetime</span>

              <button className="flex h-11 w-full items-center justify-center rounded-lg border border-gray-300 bg-white p-3.5 text-sm font-medium text-gray-400 shadow-theme-xs hover:bg-gray-50 hover:text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-white/[0.03] dark:hover:text-gray-200">
                Current Plan
              </button>

              <div className="mt-6 space-y-3">
                <FeatureItem>Unlimited Projects</FeatureItem>
                <FeatureItem>Share with 5 team members</FeatureItem>
                <FeatureItem>Sync across devices</FeatureItem>
              </div>
            </div>
          </div>

          {/* Professional */}
          <div>
            <div className="rounded-2xl bg-white p-6 dark:bg-white/[0.03]">
              <span className="block text-xl font-semibold text-gray-800 dark:text-white/90">Professional</span>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">For users who want to do more</p>
              <h2 className="mb-0.5 text-lg font-bold text-gray-800 dark:text-white/90">$99.00</h2>
              <span className="mb-6 inline-block text-sm text-gray-500 dark:text-gray-400">/year</span>

              <button className="flex h-11 w-full items-center justify-center rounded-lg bg-brand-500 p-3.5 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600">
                Try for Free
              </button>

              <div className="mt-6 space-y-3">
                <FeatureItem>Unlimited Projects</FeatureItem>
                <FeatureItem>Share with 5 team members</FeatureItem>
                <FeatureItem>Sync across devices</FeatureItem>
                <FeatureItem>30 days version history</FeatureItem>
              </div>
            </div>
          </div>

          {/* Team - Recommended */}
          <div>
            <div className="relative z-[1] rounded-2xl bg-brand-500 p-6">
              <div className="absolute right-4 top-4 -z-[1] rounded-lg bg-white/10 px-3 py-1 text-xs font-medium text-white">
                Recommended
              </div>
              <span className="block text-xl font-semibold text-white">Team</span>
              <p className="mt-1 text-sm text-white/90">Your entire team in one place</p>
              <h2 className="mb-0.5 text-lg font-bold text-white">$299</h2>
              <span className="mb-6 inline-block text-sm text-white/90">/year</span>

              <button className="flex h-11 w-full items-center justify-center rounded-lg bg-white p-3.5 text-sm font-medium text-gray-800 shadow-theme-xs hover:bg-gray-50">
                Try for Free
              </button>

              <div className="mt-6 space-y-3">
                <FeatureItem light>Unlimited Projects</FeatureItem>
                <FeatureItem light>Share with 5 team members</FeatureItem>
                <FeatureItem light>Sync across devices</FeatureItem>
                <FeatureItem light>Sharing permissions</FeatureItem>
                <FeatureItem light>Admin tools</FeatureItem>
              </div>
            </div>
          </div>

          {/* Enterprise */}
          <div>
            <div className="rounded-2xl bg-white p-6 dark:bg-white/[0.03]">
              <span className="block text-xl font-semibold text-gray-800 dark:text-white/90">Enterprise</span>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Run your company on your terms</p>
              <h2 className="mb-0.5 text-lg font-bold text-gray-800 dark:text-white/90">Custom</h2>
              <span className="mb-6 inline-block text-sm text-gray-500 dark:text-gray-400">Reach out for a quote</span>

              <button className="flex h-11 w-full items-center justify-center rounded-lg bg-brand-500 p-3.5 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600">
                Try for Free
              </button>

              <div className="mt-6 space-y-3">
                <FeatureItem>Unlimited Projects</FeatureItem>
                <FeatureItem>Share with 5 team members</FeatureItem>
                <FeatureItem>Sync across devices</FeatureItem>
                <FeatureItem>User provisioning (SCIM)</FeatureItem>
                <FeatureItem>Advanced security</FeatureItem>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PlanPage() {
  return (
    <div className="mx-auto max-w-screen-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-6">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">Plans</h2>
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/dashboard' },
            { label: 'Plans' },
          ]}
        />
      </div>

      <div className="space-y-5 sm:space-y-6">
        <PlanTableOne />
        <PaymentSecuritySection />
      </div>
    </div>
  );
}
