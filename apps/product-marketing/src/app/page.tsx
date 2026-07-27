import React from "react";
import Hero from "@/components/Hero";
// Supporter logos. Now a scrolling <LogoCarousel /> — the set is large enough that a
// static row would wrap; for a small set (~4-5) swap back to <LogoRow />.
import LogoCarousel from "@/components/LogoCarousel";
import Features from "@/components/Features";
// The annotated walkthrough of real captured product surfaces. Sits after the icon-grid overview
// so a visitor meets the breadth first, then sees it actually working.
import CapabilityShowcase from "@/components/marketing/CapabilityShowcase";
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
      <CapabilityShowcase />
      <NotableFeatures />
      <CampaignTypes />
      <Roadmap />
      <LatestBlog />
      <CTA />
    </main>
  );
}
