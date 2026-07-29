import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import Homepage2 from "@/components/homepage2/Homepage2";

/**
 * /homepage2 — the "cinema" homepage candidate, built from the design handoff in
 * docs/design_handoff_uprise_marketing/. It runs alongside the live `/` so the two
 * can be compared on the same content.
 *
 * It brings its own chrome (a condensing glass header and a dark footer), so
 * MarketingChrome suppresses the global Header/Footer for this path.
 */

// New to this app: every eyebrow, label, stat caption and meta line is mono.
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Uprise – every person, every channel, one campaign",
  description:
    "The all-in-one campaigning platform for progressive organisations – texting, calls, doorknocking, surveys, audiences and Australian data in one place.",
  // A second homepage on the same content would compete with `/` in search.
  // Drop this once a winner is picked and the loser is deleted.
  robots: { index: false, follow: false },
};

export default function Homepage2Page() {
  return (
    <div className={jetbrains.variable}>
      <Homepage2 />
    </div>
  );
}
