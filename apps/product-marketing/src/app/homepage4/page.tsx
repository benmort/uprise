import type { Metadata } from "next";
import Hero from "@/components/Hero";
import LogoCarousel from "@/components/LogoCarousel";
import Features from "@/components/Features";
import HighlightMapping from "@/components/marketing/highlight-mapping";
import NotableFeatures from "@/components/NotableFeatures";
import CampaignTypes from "@/components/CampaignTypes";
import Roadmap from "@/components/Roadmap";
import LatestBlog from "@/components/LatestBlog";
import CTA from "@/components/CTA";

/**
 * /homepage4 — the previous hero-led homepage, kept for comparison.
 *
 * This is what `/` rendered until the cinema opening won: the static <Hero /> (headline, lede,
 * launchpad CTAs) over the same section stack. Swapped here so the two can be compared side by
 * side; the sections below the opening are identical in both, so the hero is the only variable.
 *
 * Standard chrome — solid white Header, same Footer. The glass treatment moved to `/` with the
 * opening (components/MarketingChrome.tsx).
 */

export const metadata: Metadata = {
  title: "Uprise – multichannel organising platform",
  description: "SMS & WhatsApp broadcasts, voice, canvassing, audiences and a unified inbox for organisers.",
  // Same content as `/`, so it would compete with the real homepage in search.
  // Drop this route once the comparison is settled.
  robots: { index: false, follow: false },
};

export default function PreviousHomepagePage() {
  return (
    <main>
      <Hero />
      <LogoCarousel />
      <Features />
      <NotableFeatures />
      <CampaignTypes />
      <Roadmap />
      <HighlightMapping />
      <LatestBlog />
      <CTA />
    </main>
  );
}
