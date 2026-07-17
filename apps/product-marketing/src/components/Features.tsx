import React from "react";
import type { LucideIcon } from "lucide-react";
import {
  MessageSquare,
  PhoneCall,
  Inbox,
  MapPin,
  WifiOff,
  Radio,
  GitBranch,
  Gauge,
  Users,
  RefreshCw,
  Database,
  BarChart3,
  Palette,
  ShieldCheck,
  Clock,
  Ticket,
  ShieldOff,
  BadgeCheck,
} from "lucide-react";
import SectionHeading from "@/components/marketing/SectionHeading";
import FeatureCard from "@/components/marketing/FeatureCard";

const FEATURES: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: MessageSquare,
    title: "P2P text messaging",
    description:
      "Send personalised one-to-one SMS with a live dual-channel preview, proof sends, schedule-or-send and an automatic opt-out check.",
  },
  {
    icon: PhoneCall,
    title: "Browser softphone calls",
    description:
      "Place calls from the campaign's own number right in the browser – click-to-dial with a global call bar, no hardware.",
  },
  {
    icon: Inbox,
    title: "Unified team inbox",
    description:
      "One shared, claimable queue for SMS and WhatsApp replies – live over SSE, with folders, search and audible responder alerts.",
  },
  {
    icon: MapPin,
    title: "Doorknocking & turf",
    description:
      "Cut turf on a Mapbox map or from geographic areas with live address-count estimates, then build optimised walk lists.",
  },
  {
    icon: WifiOff,
    title: "Offline canvasser app",
    description:
      "An installable PWA that queues door knocks to an on-device outbox and auto-flushes the moment volunteers reconnect.",
  },
  {
    icon: Radio,
    title: "Live action room",
    description:
      "Watch active canvassers refresh in real time and push a one-tap broadcast to every volunteer's phone.",
  },
  {
    icon: GitBranch,
    title: "Branching surveys",
    description:
      "Build skip-logic surveys that run on the doors and over SMS, with per-option canned replies and disposition mapping.",
  },
  {
    icon: Gauge,
    title: "Dispositions & 5-point scoring",
    description:
      "Custom outcome codes mapped to a five-point support scale, from strong support through to strong oppose.",
  },
  {
    icon: Users,
    title: "Audiences & CSV imports",
    description:
      "Build audiences and segments, upload contacts by CSV with live import progress, and target the right channel.",
  },
  {
    icon: RefreshCw,
    title: "Action Network sync",
    description:
      "Connect and test Action Network, search lists and run sync jobs to keep your contacts in step.",
  },
  {
    icon: Database,
    title: "Australian data built in",
    description:
      "G-NAF addresses, ASGS geography, federal, state and local electoral divisions, politicians, policies and demographics.",
  },
  {
    icon: BarChart3,
    title: "Electorate polling",
    description:
      "Crosstabs, regional choropleth maps and canvassing targets – with public and embeddable views.",
  },
];

const MORE: { icon: LucideIcon; label: string }[] = [
  { icon: Palette, label: "White-label multi-brand" },
  { icon: ShieldCheck, label: "Role-based team access" },
  { icon: Clock, label: "Shift scheduling" },
  { icon: Ticket, label: "Events & RSVPs" },
  { icon: ShieldOff, label: "Opt-out compliance" },
  { icon: BadgeCheck, label: "Quality assurance" },
];

export default function Features() {
  return (
    <section
      id="features"
      className="relative z-10 bg-[linear-gradient(180deg,rgba(242,244,247,0.00)_53.55%,#F2F4F7_101.85%)] py-16 md:py-24 lg:py-30"
    >
      <div className="container">
        <SectionHeading
          eyebrow="Core Features"
          title="Fully Featured Campaigning Platform – Crafted for Modern Organisations"
          subtitle="Everything a modern campaign needs to reach people, knock doors, run volunteers and turn conversations into wins – in one platform."
        />

        <div className="mx-auto mt-12 grid max-w-[1170px] grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:gap-7.5">
          {FEATURES.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </div>

        <div className="mx-auto mt-12.5 grid max-w-[1170px] grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:gap-x-7.5 xl:gap-y-6">
          {MORE.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="group flex items-center gap-4 rounded-3xl border border-stroke-secondary bg-white px-5 py-4 duration-200 hover:border-primary-200 md:px-7.5 md:py-5"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-25 text-primary duration-200 group-hover:bg-primary group-hover:text-white">
                <Icon className="h-5 w-5" />
              </div>
              <h4 className="text-lg font-semibold text-text-color">{label}</h4>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
