import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import Chrome from "@/components/home/Chrome";
import Opening from "@/components/home/Opening";
import Toolkit from "@/components/home/Toolkit";
import DataArc from "@/components/home/DataArc";
import Teams from "@/components/home/Teams";
import Electorate from "@/components/home/Electorate";
import Research from "@/components/home/Research";
import UseCases from "@/components/home/UseCases";
import RoadmapBand from "@/components/home/RoadmapBand";
import Gallery from "@/components/home/Gallery";
import CanvassDemoFrame from "@/components/home/CanvassDemoFrame";
import Closing from "@/components/home/Closing";
import LatestPosts from "@/components/home/LatestPosts";

/**
 * The live homepage: the cinema opening over the merged section stack.
 *
 * <Opening /> replaces the old <Hero />, bringing the masked headline, parallax planes,
 * counting coverage ticker and pinned five-scene stage. <Chrome /> adds the fixed rail and the
 * scroll-progress hairline. Everything below is the merged best-of from the three candidates —
 * see each component for which one it came from.
 *
 * The previous hero-led homepage lives at /homepage4 for comparison, noindexed. Chrome is global —
 * same Header and Footer — with the header wearing the condensing glass treatment on this path only
 * (components/MarketingChrome.tsx → Header `glass`).
 *
 * The supporter-logo carousel is deliberately absent: most marks in `logos.ts` are still `hidden`
 * pending permission, so the strip states more than it can back. <LogoCarousel /> drops straight
 * back in above <Toolkit /> once there are enough cleared marks to earn it.
 */

// The eyebrows, ticker captions, stage labels and rail stops are mono.
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Uprise – every channel, one campaign",
  description:
    "The all-in-one campaigning platform for progressive organisations – texting, calls, doorknocking, surveys, audiences and Australian data in one place.",
};

export default function LandingPage() {
  return (
    <main className={jetbrains.variable}>
      {/* Fixed chrome: the scroll-progress hairline and the left rail. Outside the opening
          because the rail tracks sections all the way down the page. */}
      <Chrome />
      <Opening />
      <Toolkit />
      <DataArc />
      <Teams />
      {/* Moved out of <DataArc />, where it sat immediately above the Atlas with the same eyebrow.
          It wears the Teams/Research treatment, mirrored — capture left, copy right. */}
      <Electorate />
      <Research />
      <UseCases />
      <RoadmapBand />
      {/* The phone holds the real canvasser app, served from the field PWA's public /demo. */}
      <Gallery demo={<CanvassDemoFrame />} />
      <LatestPosts />
      <Closing />
    </main>
  );
}
