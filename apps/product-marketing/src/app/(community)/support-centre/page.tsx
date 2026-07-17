import React from "react";
import Link from "next/link";
import { BookOpen, LifeBuoy, Mail, MessagesSquare, Rocket, ShieldCheck } from "lucide-react";

export const metadata = {
  title: "Support Centre – Help with Uprise | Uprise",
  description:
    "Get help with Uprise – developer docs, getting started, contacting the team, and answers on data, compliance and security for your campaign.",
};

const CHANNELS = [
  {
    icon: Rocket,
    title: "Getting started",
    body: "New to Uprise? Set up your organisation, import contacts, and send your first text or cut your first turf.",
    href: "/for-campaigners",
    cta: "Explore the platform",
  },
  {
    icon: BookOpen,
    title: "Developer docs",
    body: "Architecture, data model and integration guides for teams building on or alongside Uprise.",
    href: "/developers",
    cta: "Read the docs",
  },
  {
    icon: MessagesSquare,
    title: "Contact the team",
    body: "Have a question our docs don't answer? Send us a message and we'll get back to you.",
    href: "/contact-us",
    cta: "Contact us",
  },
  {
    icon: LifeBuoy,
    title: "Book a walkthrough",
    body: "Want a guided tour for your organisation? Request a demo and we'll show you the whole toolkit.",
    href: "/request-demo",
    cta: "Request a demo",
  },
];

const TOPICS = [
  {
    icon: Mail,
    title: "Sending & compliance",
    body: "Opt-outs are honoured across every send, and each message is checked for the required opt-out language before it goes out. See our compliance approach.",
    href: "/compliance",
    cta: "Compliance",
  },
  {
    icon: ShieldCheck,
    title: "Data & security",
    body: "How we isolate each organisation's data, how we handle personal information under Australian privacy law, and how we keep it secure.",
    href: "/security",
    cta: "Security",
  },
];

export default function SupportCentrePage() {
  return (
    <main>
      <section className="pb-5 pt-17.5">
        <div className="container">
          <div className="mx-auto mb-5 w-full max-w-[810px] text-center pt-17.5">
            <span className="mb-5 inline-block text-lg font-medium text-primary">Support Centre</span>
            <h1 className="mb-4 text-3xl font-bold !leading-[1.2] text-title-color md:text-[40px]">
              Help, when your campaign can't wait
            </h1>
            <p className="text-base text-text-color-secondary">
              Whether you're setting up your first send or running a national program, here's how to
              get answers fast.
            </p>
          </div>
        </div>
      </section>

      <section className="py-8 md:py-12">
        <div className="container">
          <div className="mx-auto grid w-full max-w-[1000px] grid-cols-1 gap-4 sm:grid-cols-2">
            {CHANNELS.map(({ icon: Icon, title, body, href, cta }) => (
              <div
                key={title}
                className="flex flex-col rounded-3xl border border-stroke-secondary bg-white p-6 duration-200 hover:border-primary-200 md:p-7"
              >
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-25 text-primary">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="mb-2 text-xl font-semibold text-title-color">{title}</h3>
                <p className="mb-6 flex-1 text-base !leading-normal text-text-color-secondary">{body}</p>
                <Link
                  href={href}
                  className="inline-flex w-fit items-center justify-center rounded-lg border border-stroke bg-white px-4 py-2.5 text-sm font-medium text-text-color duration-200 hover:border-primary-200 hover:text-primary"
                >
                  {cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-8 md:py-12">
        <div className="container">
          <div className="mx-auto mb-8 flex w-full max-w-[1000px] items-center gap-3">
            <h2 className="text-xl font-semibold text-title-color">Common topics</h2>
            <span className="h-px flex-1 bg-stroke-secondary" />
          </div>
          <div className="mx-auto grid w-full max-w-[1000px] grid-cols-1 gap-4 sm:grid-cols-2">
            {TOPICS.map(({ icon: Icon, title, body, href, cta }) => (
              <div
                key={title}
                className="flex flex-col rounded-3xl border border-stroke-secondary bg-gray-50 p-6 md:p-7"
              >
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-white text-primary">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="mb-2 text-xl font-semibold text-title-color">{title}</h3>
                <p className="mb-6 flex-1 text-base !leading-normal text-text-color-secondary">{body}</p>
                <Link
                  href={href}
                  className="inline-flex w-fit items-center justify-center rounded-lg border border-stroke bg-white px-4 py-2.5 text-sm font-medium text-text-color duration-200 hover:border-primary-200 hover:text-primary"
                >
                  {cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="pb-16 md:pb-24">
        <div className="container">
          <div className="mx-auto flex w-full max-w-[810px] flex-col items-center rounded-3xl border border-stroke bg-white px-8 py-12 text-center">
            <h2 className="mb-4 text-2xl font-bold !leading-[1.2] text-title-color md:text-3xl">
              Still stuck?
            </h2>
            <p className="mb-8 max-w-[560px] text-base text-text-color-secondary">
              Send the team a message – tell us what you're trying to do and we'll point you the
              right way.
            </p>
            <Link
              href="/contact-us"
              className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-5 py-3.5 text-base font-medium text-white duration-200 hover:bg-brand-600"
            >
              Contact us
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
