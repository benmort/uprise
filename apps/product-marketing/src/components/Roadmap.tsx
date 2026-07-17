import React from "react";
import { Mail, MessageCircle, MessageSquare, Workflow, Filter, type LucideIcon } from "lucide-react";
import SectionHeading from "@/components/marketing/SectionHeading";

type RoadmapItem = {
  icon: LucideIcon;
  name: string;
  description: string;
};

const items: RoadmapItem[] = [
  {
    icon: Mail,
    name: "Email broadcasts",
    description: "Send campaign-wide email alongside your SMS and voice outreach.",
  },
  {
    icon: MessageCircle,
    name: "Social media DMs",
    description: "Reach and reply to supporters in their social inboxes.",
  },
  {
    icon: MessageSquare,
    name: "WhatsApp",
    description: "Outbound WhatsApp conversations from your unified inbox.",
  },
  {
    icon: Workflow,
    name: "Journeys & automation",
    description: "Trigger multi-step sequences off supporter actions and dispositions.",
  },
  {
    icon: Filter,
    name: "Advanced segmentation",
    description: "Layered rules and behavioural filters for sharper targeting.",
  },
];

export default function Roadmap() {
  return (
    <section className="bg-gray-50 py-16 md:py-20">
      <div className="container">
        <SectionHeading
          eyebrow="On the roadmap"
          title="What's coming next"
          subtitle="We build in the open. These are in active development – not available yet."
        />
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.name}
                className="rounded-2xl border border-dashed border-stroke-secondary bg-white/60 p-6"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-text-color-secondary">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-text-color-secondary">
                    Coming soon
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-semibold text-title-color">{item.name}</h3>
                <p className="mt-1.5 text-sm text-text-color-secondary">{item.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
