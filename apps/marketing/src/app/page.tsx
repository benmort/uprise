import React from "react";
import Hero from "@/components/Hero";
// Supporter logos. Small set (~4-5) -> static <LogoRow />. Once the list is long
// enough to scroll, swap the import + tag below to <LogoCarousel />.
import LogoRow from "@/components/LogoRow";
import CommsChannels from "@/components/CommsChannels";
import Features from "@/components/Features";
import CTA from "@/components/CTA";

export default function LandingPage() {
  return (
    <main>
      <Hero />
      <LogoRow />
      <CommsChannels />
      <Features />
      <CTA />
    </main>
  );
}
