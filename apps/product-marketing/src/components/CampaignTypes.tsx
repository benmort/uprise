import React from "react";
import {
  Vote,
  Megaphone,
  Users,
  HardHat,
  Footprints,
  ClipboardCheck,
} from "lucide-react";
import SectionHeading from "@/components/marketing/SectionHeading";
import CategoryCard from "@/components/marketing/CategoryCard";

const CAMPAIGN_TYPES = [
  {
    icon: Vote,
    name: "Electoral & candidate",
    description:
      "Cut turf, knock doors and text voters from the candidate's own number – with electorate data and polling built in.",
  },
  {
    icon: Megaphone,
    name: "Advocacy & issue",
    description:
      "Run P2P SMS and calls, capture support on a 5-point scale, and sync every contact to Action Network.",
  },
  {
    icon: Users,
    name: "Community organising",
    description:
      "Coordinate volunteers with shifts, a shared claimable inbox and a live action room that updates in real time.",
  },
  {
    icon: HardHat,
    name: "Union & member",
    description:
      "Reach members by SMS and phone, survey them at the door or over text, and segment by workplace or region.",
  },
  {
    icon: Footprints,
    name: "GOTV & field",
    description:
      "Optimised walk lists, an offline-first canvasser app and pace-vs-target goals to get the vote out on the day.",
  },
  {
    icon: ClipboardCheck,
    name: "Referendum & ballot",
    description:
      "Map the electorate, canvass yes/no support with branching surveys, and track the contact funnel to polling day.",
  },
];

export default function CampaignTypes() {
  return (
    <section className="py-16 md:py-24 lg:py-30">
      <div className="container">
        <SectionHeading
          eyebrow="Built for the work"
          title="Built for every kind of campaign"
          subtitle="Electoral, advocacy, community organising, union, GOTV, referendum – and more."
        />
        <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {CAMPAIGN_TYPES.map((type) => (
            <CategoryCard
              key={type.name}
              icon={type.icon}
              name={type.name}
              description={type.description}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
