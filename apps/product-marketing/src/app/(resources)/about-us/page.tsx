import React from "react";
import Link from "next/link";
import { Flag, HeartHandshake, MapPin, ShieldCheck, Sparkles, Users } from "lucide-react";

export const metadata = {
  title: "About Us – Built for people-powered campaigns | Uprise",
  description:
    "Uprise is the all-in-one campaigning platform for progressive organisations in Australia – texting, calls, doorknocking, surveys, audiences and Australian data in one place. Built by Uprise Labs.",
};

const VALUES = [
  {
    icon: Flag,
    title: "Movements, not vanity metrics",
    body: "We build for organisers who need to move real people to act – not dashboards that look busy. Every feature earns its place at the door or on the phone.",
  },
  {
    icon: MapPin,
    title: "Built for Australia",
    body: "G-NAF addresses, ASGS geography, federal, state and local electorates, politicians and referendum data are built in – not bolted on from an overseas tool.",
  },
  {
    icon: ShieldCheck,
    title: "Trust by default",
    body: "Opt-outs are honoured across every send, data is isolated per organisation, and compliance is a floor you can't accidentally cross.",
  },
  {
    icon: Sparkles,
    title: "One platform, not ten tabs",
    body: "Texting, calls, a shared inbox, canvassing, surveys, audiences and reporting live together – so your team stops stitching tools and starts organising.",
  },
  {
    icon: Users,
    title: "Made with organisers",
    body: "We build alongside the campaigners who use Uprise every day. Their field problems set our roadmap, not the other way around.",
  },
  {
    icon: HeartHandshake,
    title: "On the side of progress",
    body: "We partner with organisations driving change and give them tools that were, for too long, only affordable to the other side.",
  },
];

export default function AboutPage() {
  return (
    <main>
      <section className="pb-5 pt-17.5">
        <div className="container">
          <div className="mx-auto mb-5 w-full max-w-[810px] text-center pt-17.5">
            <span className="mb-5 inline-block text-lg font-medium text-primary">About Uprise</span>
            <h1 className="mb-4 text-3xl font-bold !leading-[1.2] text-title-color md:text-[40px]">
              The campaigning platform built for progress
            </h1>
            <p className="text-base text-text-color-secondary">
              Uprise is the all-in-one platform progressive organisations use to reach people, knock
              doors, run volunteers and turn conversations into wins. We partner with the
              organisations building the future – and give them the tools to do it. Uprise is a
              product of Uprise Labs.
            </p>
          </div>
        </div>
      </section>

      <section className="py-8 md:py-12">
        <div className="container">
          <div className="mx-auto max-w-[810px] rounded-3xl border border-stroke bg-white px-8 py-10 md:px-12">
            <h2 className="mb-4 text-2xl font-bold !leading-[1.2] text-title-color md:text-3xl">
              Why we exist
            </h2>
            <p className="mb-4 text-base !leading-relaxed text-text-color-secondary">
              For years the best campaigning technology sat behind price tags only the largest,
              best-resourced players could afford. Progressive campaigns – often smaller, often
              volunteer-run – were left stitching together a texting tool, a spreadsheet, a mapping
              app and a survey form, losing data and momentum in the gaps.
            </p>
            <p className="text-base !leading-relaxed text-text-color-secondary">
              Uprise closes those gaps. One platform carries a conversation from a text or a door
              knock all the way through to a targeted follow-up, with Australian electoral data and
              opt-out compliance built in. It is fast enough for a Saturday morning of doorknocking
              and serious enough to run a national program.
            </p>
          </div>
        </div>
      </section>

      <section className="py-8 md:py-12">
        <div className="container">
          <div className="mx-auto mb-10 w-full max-w-[720px] text-center">
            <h2 className="mb-3 text-2xl font-bold !leading-[1.2] text-title-color md:text-3xl">
              What we believe
            </h2>
            <p className="text-base text-text-color-secondary">
              A handful of principles shape everything we build.
            </p>
          </div>
          <div className="mx-auto grid w-full max-w-[1170px] grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:gap-7.5">
            {VALUES.map(({ icon: Icon, title, body }) => (
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
              Build your next campaign on Uprise
            </h2>
            <p className="mb-8 max-w-[560px] text-base text-text-color-secondary">
              See how the whole toolkit fits together, or talk to us about your organisation.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link
                href="/campaigners"
                className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-5 py-3.5 text-base font-medium text-white duration-200 hover:bg-brand-600"
              >
                Explore the platform
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
