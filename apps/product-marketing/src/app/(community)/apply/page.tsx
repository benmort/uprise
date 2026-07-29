import React from "react";
import Image from "next/image";
import Link from "next/link";
import { HandHeart, HeartHandshake, Scale, ShieldCheck, Sprout, Users } from "lucide-react";
import GrassrootsApplicationForm from "@/components/GrassrootsApplicationForm";

export const metadata = {
  title: "Apply for a Grassroots licence | Uprise",
  description:
    "Philanthropically funded Uprise licences for grassroots organisations. The full platform, no cost, no stripped-back tier – tell us about your campaign and apply.",
};

/** What the licence actually is, stated plainly – these are the three things people ask first. */
const PRINCIPLES = [
  {
    icon: Sprout,
    title: "The full platform, not a trial",
    body: "A Grassroots licence is not a cut-down tier with the useful parts removed. You get the same product a paying organisation gets, because a smaller budget does not mean a smaller campaign.",
  },
  {
    icon: HeartHandshake,
    title: "Paid for by philanthropy",
    body: "Uprise is partly philanthropically funded so that campaigning tools are not rationed by budget. That funding covers these licences outright – there is no invoice waiting at the end.",
  },
  {
    icon: Scale,
    title: "Assessed, not sold",
    body: "There is no sales process. You tell us what you work on, a person reads it, and we make a decision. If we say no, we will tell you why and point you somewhere useful.",
  },
];

/** Deliberately concrete: vague eligibility copy makes people self-reject. */
const GOOD_FIT = [
  "Volunteer-run groups with no paid staff",
  "First Nations-led organisations and campaigns",
  "Small teams outgrowing spreadsheets and group chats",
  "Local climate, housing and justice campaigns",
  "Unincorporated groups without charity status",
  "Organisations whose funding does not stretch to software",
];

export default function ApplyPage() {
  return (
    <main>
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="pb-12 pt-17.5">
        <div className="container">
          <div className="mx-auto grid w-full max-w-[1170px] items-center gap-10 pt-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <span className="mb-5 inline-block text-lg font-medium text-primary">
                Philanthropic licences
              </span>
              <h1 className="mb-5 text-3xl font-bold !leading-[1.15] text-title-color md:text-[44px]">
                Good organising shouldn&apos;t be rationed by budget
              </h1>
              <p className="mb-8 text-base !leading-relaxed text-text-color-secondary md:text-lg">
                Some of the most important campaigning in the country is run by people with no
                budget for software. Uprise Grassroots is a philanthropically funded licence for
                those organisations – the whole platform, at no cost, for as long as you need it.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="#apply"
                  className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-6 py-3.5 text-base font-medium text-white duration-200 hover:bg-brand-600"
                >
                  Apply with us
                </Link>
                <Link
                  href="/plans"
                  className="inline-flex items-center justify-center rounded-lg border border-stroke bg-white px-6 py-3.5 text-base font-medium text-text-color duration-200 hover:border-primary-200"
                >
                  See all plans
                </Link>
              </div>
            </div>
            <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-stroke">
              <Image
                src="/images/apply/grassroots-hands.jpg"
                alt="Volunteers at a community organising session putting their hands together in the centre of a circle"
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
                priority
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── What the licence is ──────────────────────────────────────── */}
      <section className="py-12 md:py-16">
        <div className="container">
          <div className="mx-auto grid w-full max-w-[1170px] grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:gap-7.5">
            {PRINCIPLES.map(({ icon: Icon, title, body }) => (
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

      {/* ── Who it's for ─────────────────────────────────────────────── */}
      <section className="py-12 md:py-16">
        <div className="container">
          <div className="mx-auto grid w-full max-w-[1170px] items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div className="relative aspect-[3/2] overflow-hidden rounded-3xl border border-stroke lg:order-2">
              <Image
                src="/images/apply/grassroots-organisers.jpg"
                alt="Organisers talking together outdoors at a community gathering"
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
              />
            </div>
            <div className="lg:order-1">
              <h2 className="mb-5 text-2xl font-bold !leading-[1.2] text-title-color md:text-[32px]">
                We look at the work, not the letterhead
              </h2>
              <p className="mb-7 text-base !leading-relaxed text-text-color-secondary">
                You do not need to be an incorporated charity, and you do not need a grant history.
                If your organisation is doing work that matters and the tooling is holding you back,
                that is enough to apply.
              </p>
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {GOOD_FIT.map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <HandHeart className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                    <span className="text-base text-text-color-secondary">{item}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-7 text-base text-text-color-tertiary">
                Not sure whether you qualify? Apply anyway – it costs you a few minutes, and we
                would rather read one application too many than miss you.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── The application ──────────────────────────────────────────── */}
      <section id="apply" className="scroll-mt-24 py-12 md:py-16">
        <div className="container">
          <div className="mx-auto w-full max-w-[810px]">
            <div className="mb-10 text-center">
              <h2 className="mb-4 text-2xl font-bold !leading-[1.2] text-title-color md:text-[32px]">
                Apply for a Grassroots licence
              </h2>
              <p className="text-base text-text-color-secondary">
                Six short questions. A person reads every application, and you will hear back within
                a few working days either way.
              </p>
            </div>
            <GrassrootsApplicationForm />
          </div>
        </div>
      </section>

      {/* ── Closing reassurance ──────────────────────────────────────── */}
      <section className="pb-16 md:pb-24">
        <div className="container">
          <div className="mx-auto grid w-full max-w-[1170px] grid-cols-1 gap-3 sm:grid-cols-3 xl:gap-7.5">
            {[
              {
                icon: ShieldCheck,
                title: "Your data stays yours",
                body: "Your supporters are not our product. We do not sell, share or mine your lists, on any plan.",
              },
              {
                icon: Users,
                title: "Real support",
                body: "You get the same help a paying organisation gets. A free licence is not a second-class queue.",
              },
              {
                icon: Sprout,
                title: "Room to grow",
                body: "If your funding changes, we will move you across without disruption. The licence does not lapse because you had a good year.",
              },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-2xl border border-stroke bg-white p-6">
                <Icon className="mb-4 h-8 w-8 text-primary" aria-hidden />
                <h3 className="mb-2 text-lg font-semibold text-title-color">{title}</h3>
                <p className="text-base !leading-normal text-text-color-secondary">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
