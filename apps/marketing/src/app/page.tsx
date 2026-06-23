import React from "react";
import Hero from "@/components/Hero";
import LogoCarousel from "@/components/LogoCarousel";
import CommsChannels from "@/components/CommsChannels";
import Features from "@/components/Features";
import CTA from "@/components/CTA";

export default function LandingPage() {
  return (
    <main>
      <Hero />
      <LogoCarousel />
      <CommsChannels />
      <Features />
      <CTA />
    </main>
  );
}
