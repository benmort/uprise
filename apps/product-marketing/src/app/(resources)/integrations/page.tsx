import React from "react";
import Link from "next/link";
import { Database, FileSpreadsheet, Network, Plug, RefreshCw, Workflow } from "lucide-react";

export const metadata = {
  title: "Integrations – Bring your lists and data into Uprise | Uprise",
  description:
    "Sync Action Network lists two ways, import contacts by CSV, and build on Australian civic data. Uprise connects to the tools campaigns already run on.",
};

const LIVE = [
  {
    icon: Network,
    title: "Action Network",
    body: "Connect your Action Network account, search your lists, and sync their members into Uprise audiences. Test the connection before you sync, then run it on demand and watch progress live.",
  },
  {
    icon: FileSpreadsheet,
    title: "CSV import",
    body: "Upload contacts from any tool as a CSV, with live import progress and per-row error reporting. Map names, mobiles and custom fields straight onto the contact spine.",
  },
  {
    icon: Database,
    title: "Australian civic data",
    body: "G-NAF addresses, ASGS statistical geography, federal, state and local electoral divisions, politicians, referendum and demographics are built in – no import required.",
  },
];

const COMING = [
  {
    icon: Plug,
    title: "More CRMs & data sources",
    body: "Additional list and CRM connectors are on the roadmap. Tell us what your organisation runs on and we'll prioritise it.",
  },
  {
    icon: Workflow,
    title: "Journeys & automation",
    body: "Trigger multi-step sequences off supporter actions and dispositions. In active development.",
  },
];

export default function IntegrationsPage() {
  return (
    <main>
      <section className="pb-5 pt-17.5">
        <div className="container">
          <div className="mx-auto mb-5 w-full max-w-[810px] text-center pt-17.5">
            <span className="mb-5 inline-block text-lg font-medium text-primary">Integrations</span>
            <h1 className="mb-4 text-3xl font-bold !leading-[1.2] text-title-color md:text-[40px]">
              Bring your lists and data into one platform
            </h1>
            <p className="text-base text-text-color-secondary">
              Campaigns don't start from scratch – they start from the lists, tools and data they
              already have. Uprise connects to them, resolves everyone onto a single contact spine,
              and keeps opt-outs honoured across every channel.
            </p>
          </div>
        </div>
      </section>

      <section className="py-8 md:py-12">
        <div className="container">
          <div className="mx-auto mb-8 flex w-full max-w-[1170px] items-center gap-3">
            <h2 className="text-xl font-semibold text-title-color">Available now</h2>
            <span className="h-px flex-1 bg-stroke-secondary" />
          </div>
          <div className="mx-auto grid w-full max-w-[1170px] grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:gap-7.5">
            {LIVE.map(({ icon: Icon, title, body }) => (
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

      <section className="py-8 md:py-12">
        <div className="container">
          <div className="mx-auto max-w-[810px] rounded-3xl border border-stroke bg-white px-8 py-10 md:px-12">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-25 text-primary">
              <RefreshCw className="h-6 w-6" />
            </div>
            <h2 className="mb-4 text-2xl font-bold !leading-[1.2] text-title-color md:text-3xl">
              How syncing works
            </h2>
            <p className="mb-4 text-base !leading-relaxed text-text-color-secondary">
              Connect a source once, and Uprise pulls its members into an audience you can target
              from any send. Every contact is de-duplicated onto a single spine, matched to their
              electorate where an address is known, and checked against your opt-out ledger – so a
              supporter who has said stop stays excluded everywhere, automatically.
            </p>
            <p className="text-base !leading-relaxed text-text-color-secondary">
              From there, build a Search – a live audience definition over your contacts – and reach
              exactly the people you mean to, across SMS and calls.
            </p>
          </div>
        </div>
      </section>

      <section className="py-8 md:py-12">
        <div className="container">
          <div className="mx-auto mb-8 flex w-full max-w-[1170px] items-center gap-3">
            <h2 className="text-xl font-semibold text-title-color">On the roadmap</h2>
            <span className="h-px flex-1 bg-stroke-secondary" />
          </div>
          <div className="mx-auto grid w-full max-w-[1170px] grid-cols-1 gap-3 sm:grid-cols-2 xl:gap-7.5">
            {COMING.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="rounded-2xl border border-dashed border-stroke-secondary bg-gray-50/60 p-6"
              >
                <div className="mb-4 flex items-center justify-between">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100 text-text-color-secondary">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-text-color-secondary">
                    Coming soon
                  </span>
                </div>
                <h3 className="mb-1.5 text-lg font-semibold text-title-color">{title}</h3>
                <p className="text-sm !leading-normal text-text-color-secondary">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="pb-16 md:pb-24">
        <div className="container">
          <div className="mx-auto flex w-full max-w-[810px] flex-col items-center rounded-3xl border border-stroke bg-white px-8 py-12 text-center">
            <h2 className="mb-4 text-2xl font-bold !leading-[1.2] text-title-color md:text-3xl">
              Need a specific integration?
            </h2>
            <p className="mb-8 max-w-[560px] text-base text-text-color-secondary">
              Tell us what your organisation runs on. We'll let you know what's possible today and
              what's coming next.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link
                href="/contact-us"
                className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-5 py-3.5 text-base font-medium text-white duration-200 hover:bg-brand-600"
              >
                Talk to us
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
