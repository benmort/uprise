import React from "react";
import Hero from "@/components/Hero";
// Supporter logos. Now a scrolling <LogoCarousel /> — the set is large enough that a
// static row would wrap; for a small set (~4-5) swap back to <LogoRow />.
import LogoCarousel from "@/components/LogoCarousel";
import Features from "@/components/Features";
// The annotated walkthrough of real captured product surfaces now leads the page — it renders
// inside <Hero />, so there is no separate section for it here.
import HighlightMapping from "@/components/marketing/highlight-mapping";
import NotableFeatures from "@/components/NotableFeatures";
import CampaignTypes from "@/components/CampaignTypes";
import Roadmap from "@/components/Roadmap";
import LatestBlog from "@/components/LatestBlog";
import CTA from "@/components/CTA";

export default function LandingPage() {
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
