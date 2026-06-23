import React from "react";
import { 
  Globe, 
  Shield, 
  Users, 
  Zap, 
  CreditCard,
  Layout,
  BarChart3,
  Settings,
  Palette
} from "lucide-react";

export default function Features() {
  return (
    <section id="features" className="relative z-10 bg-[linear-gradient(180deg,rgba(242,244,247,0.00)_53.55%,#F2F4F7_101.85%)] py-16 md:py-24 lg:py-30">
      <div className="container">
        <div className="mx-auto mb-12 w-full max-w-[880px] text-center lg:mb-15">
          <span className="mb-5 inline-block text-lg font-medium text-primary">
            Core Features
          </span>
          <h2 className="text-3xl font-bold !leading-[1.2] text-title-color md:text-[40px]">
            Fully Featured Campaigning Platform – Crafted for Modern Organisations
          </h2>
        </div>
        
        <div className="container">
          <div className="mx-auto grid w-full max-w-[1170px] grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:gap-7.5">
            <div className="rounded-3xl border border-stroke-secondary bg-gray-50 p-1 duration-200 hover:border-primary-200 hover:bg-primary-25 md:p-2">
              <div className="h-full rounded-2xl border border-[#F2F4F7] bg-white p-4 md:p-6">
                <div className="mb-7.5 text-primary">
                  <Globe className="h-12 w-12" />
                </div>
                <h3 className="mb-4 text-xl font-semibold text-title-color md:text-2xl lg:text-xl xl:text-2xl">
                  Custom Subdomains
                </h3>
                <p className="text-base !leading-normal text-text-color-secondary">
                  Each client gets their own branded portal at yourname.foment.org.au with custom branding, colors, and domain management.
                </p>
              </div>
            </div>

            <div className="rounded-3xl border border-stroke-secondary bg-gray-50 p-1 duration-200 hover:border-primary-200 hover:bg-primary-25 md:p-2">
              <div className="h-full rounded-2xl border border-[#F2F4F7] bg-white p-4 md:p-6">
                <div className="mb-7.5 text-primary">
                  <Shield className="h-12 w-12" />
                </div>
                <h3 className="mb-4 text-xl font-semibold text-title-color md:text-2xl lg:text-xl xl:text-2xl">
                  Secure Access Control
                </h3>
                <p className="text-base !leading-normal text-text-color-secondary">
                  Role-based permissions and secure authentication for your team and clients with multi-factor authentication support.
                </p>
              </div>
            </div>

            <div className="rounded-3xl border border-stroke-secondary bg-gray-50 p-1 duration-200 hover:border-primary-200 hover:bg-primary-25 md:p-2">
              <div className="h-full rounded-2xl border border-[#F2F4F7] bg-white p-4 md:p-6">
                <div className="mb-7.5 text-primary">
                  <Users className="h-12 w-12" />
                </div>
                <h3 className="mb-4 text-xl font-semibold text-title-color md:text-2xl lg:text-xl xl:text-2xl">
                  Team Management
                </h3>
                <p className="text-base !leading-normal text-text-color-secondary">
                  Invite team members with different access levels and roles. Manage client relationships and project collaboration.
                </p>
              </div>
            </div>

            <div className="rounded-3xl border border-stroke-secondary bg-gray-50 p-1 duration-200 hover:border-primary-200 hover:bg-primary-25 md:p-2">
              <div className="h-full rounded-2xl border border-[#F2F4F7] bg-white p-4 md:p-6">
                <div className="mb-7.5 text-primary">
                  <Zap className="h-12 w-12" />
                </div>
                <h3 className="mb-4 text-xl font-semibold text-title-color md:text-2xl lg:text-xl xl:text-2xl">
                  Quick Setup
                </h3>
                <p className="text-base !leading-normal text-text-color-secondary">
                  Get your client portal running in minutes, not days. Pre-built templates and components for rapid deployment.
                </p>
              </div>
            </div>

            <div className="rounded-3xl border border-stroke-secondary bg-gray-50 p-1 duration-200 hover:border-primary-200 hover:bg-primary-25 md:p-2">
              <div className="h-full rounded-2xl border border-[#F2F4F7] bg-white p-4 md:p-6">
                <div className="mb-7.5 text-primary">
                  <Palette className="h-12 w-12" />
                </div>
                <h3 className="mb-4 text-xl font-semibold text-title-color md:text-2xl lg:text-xl xl:text-2xl">
                  Custom Branding
                </h3>
                <p className="text-base !leading-normal text-text-color-secondary">
                  Upload your logo, set brand colors, and customize the experience to match your organisation&apos;s identity.
                </p>
              </div>
            </div>

            <div className="rounded-3xl border border-stroke-secondary bg-gray-50 p-1 duration-200 hover:border-primary-200 hover:bg-primary-25 md:p-2">
              <div className="h-full rounded-2xl border border-[#F2F4F7] bg-white p-4 md:p-6">
                <div className="mb-7.5 text-primary">
                  <CreditCard className="h-12 w-12" />
                </div>
                <h3 className="mb-4 text-xl font-semibold text-title-color md:text-2xl lg:text-xl xl:text-2xl">
                  Payments
                </h3>
                <p className="text-base !leading-normal text-text-color-secondary">
                  Built-in billing and subscription management for your clients with automated invoicing and payment processing.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-12.5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:gap-x-7.5 xl:gap-y-6">
            <div className="flex items-center gap-4 rounded-3xl border border-stroke-secondary bg-white px-4 py-3 duration-200 hover:border-primary-200 md:px-7.5 md:py-6">
              <div className="flex items-center gap-4">
                <div className="text-primary">
                  <Layout className="h-7 w-7 md:h-9 md:w-9 lg:h-7 lg:w-7 xl:h-9 xl:w-9" />
                </div>
                <h4 className="text-lg font-semibold text-text-color md:text-xl lg:text-lg xl:text-xl">
                  Fully Responsive
                </h4>
              </div>
            </div>

            <div className="flex items-center gap-4 rounded-3xl border border-stroke-secondary bg-white px-4 py-3 duration-200 hover:border-primary-200 md:px-7.5 md:py-6">
              <div className="flex items-center gap-4">
                <div className="text-primary">
                  <BarChart3 className="h-7 w-7 md:h-9 md:w-9 lg:h-7 lg:w-7 xl:h-9 xl:w-9" />
                </div>
                <h4 className="text-lg font-semibold text-text-color md:text-xl lg:text-lg xl:text-xl">
                  Analytics Dashboard
                </h4>
              </div>
            </div>

            <div className="flex items-center gap-4 rounded-3xl border border-stroke-secondary bg-white px-4 py-3 duration-200 hover:border-primary-200 md:px-7.5 md:py-6">
              <div className="flex items-center gap-4">
                <div className="text-primary">
                  <Settings className="h-7 w-7 md:h-9 md:w-9 lg:h-7 lg:w-7 xl:h-9 xl:w-9" />
                </div>
                <h4 className="text-lg font-semibold text-text-color md:text-xl lg:text-lg xl:text-xl">
                  Multi-Framework
                </h4>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
