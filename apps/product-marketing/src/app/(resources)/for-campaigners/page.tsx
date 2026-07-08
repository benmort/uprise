import React from "react";
import Link from "next/link";
import { Building2, Globe, Palette, Layers, Users, ShieldCheck } from "lucide-react";

export const metadata = {
  title: "For Campaigners – Multi-tenant & multi-brand portals | Uprise",
  description:
    "Run many campaigns, brands and partner organisations from one Uprise account – each with its own branded, white-label portal. Available on the Scale plan.",
};

const CAPABILITIES = [
  {
    icon: Building2,
    title: "Many organisations, one account",
    body: "Spin up a separate tenant for every campaign, chapter or partner org. Each keeps its own contacts, team and data – fully isolated.",
  },
  {
    icon: Globe,
    title: "White-label subdomains",
    body: "Give each tenant its own branded portal at yourname.uprise.org.au, so supporters only ever see the campaign they signed up for.",
  },
  {
    icon: Palette,
    title: "Per-tenant branding",
    body: "Set logo, colours and custom CSS per tenant. One platform, many identities – no compromise on look and feel.",
  },
  {
    icon: Layers,
    title: "Run brands in parallel",
    body: "Manage every brand side by side, switch between them in a click, and roll campaigns out across your whole network at once.",
  },
  {
    icon: Users,
    title: "Scoped teams & roles",
    body: "Invite organisers into the tenants they work on, with role-based access. Central oversight, local control.",
  },
  {
    icon: ShieldCheck,
    title: "Isolated and secure",
    body: "Multi-tenant data isolation keeps every brand's supporters, lists and reporting separate by default.",
  },
];

export default function ForCampaignersPage() {
  return (
    <main>
      <section className="pb-5 pt-17.5">
        <div className="container">
          <div className="mx-auto mb-5 w-full max-w-[810px] text-center pt-17.5">
            <span className="mb-5 inline-block text-lg font-medium text-primary">
              Multi-tenant &amp; multi-brand
            </span>
            <h1 className="mb-4 text-3xl font-bold !leading-[1.2] text-title-color md:text-[40px]">
              One platform for every campaign and brand you run
            </h1>
            <p className="text-base text-text-color-secondary">
              Agencies, coalitions and large organisations run dozens of campaigns at once. Uprise
              lets you manage them all from a single account – each with its own branded, white-label
              portal. Available on the Scale plan.
            </p>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16">
        <div className="container">
          <div className="mx-auto grid w-full max-w-[1170px] grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:gap-7.5">
            {CAPABILITIES.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="rounded-3xl border border-stroke-secondary bg-gray-50 p-1 duration-200 hover:border-primary-200 hover:bg-primary-25 md:p-2"
              >
                <div className="h-full rounded-2xl border border-[#F2F4F7] bg-white p-4 md:p-6">
                  <div className="mb-7.5 text-primary">
                    <Icon className="h-12 w-12" />
                  </div>
                  <h3 className="mb-4 text-xl font-semibold text-title-color md:text-2xl lg:text-xl xl:text-2xl">
                    {title}
                  </h3>
                  <p className="text-base !leading-normal text-text-color-secondary">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="pb-16 md:pb-24">
        <div className="container">
          <div className="mx-auto flex w-full max-w-[810px] flex-col items-center rounded-3xl border border-stroke bg-white px-8 py-12 text-center">
            <h2 className="mb-4 text-2xl font-bold !leading-[1.2] text-title-color md:text-3xl">
              Ready to run your brands from one place?
            </h2>
            <p className="mb-8 max-w-[560px] text-base text-text-color-secondary">
              Multi-tenant &amp; multi-brand is included on the Scale plan. See pricing, or talk to
              us about your network.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link
                href="/plans"
                className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-5 py-3.5 text-base font-medium text-white duration-200 hover:bg-brand-600"
              >
                See pricing
              </Link>
              <Link
                href="/request-demo"
                className="inline-flex items-center justify-center rounded-lg border border-stroke bg-white px-5 py-3.5 text-base font-medium text-text-color duration-200 hover:border-primary-200"
              >
                Request a demo
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
