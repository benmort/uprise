import type { Metadata } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import Homepage3 from "@/components/homepage3/Homepage3";

/**
 * /homepage3 — the "editorial" homepage candidate, built from the standalone design handoff
 * (`Uprise Homepage (standalone).html`). It runs alongside the live `/` and `/homepage2` so the
 * three can be compared on the same content.
 *
 * It brings its own chrome (a sticky glass header and a light footer), so MarketingChrome
 * suppresses the global Header/Footer for this path.
 */

// Every eyebrow, label, figure caption and status line on this variant is mono.
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-ibm-plex-mono",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Uprise – every person, every channel, one campaign",
  description:
    "The all-in-one campaigning platform for progressive organisations – texting, calls, doorknocking, surveys, audiences and Australian data in one place.",
  // A third homepage on the same content would compete with `/` in search.
  // Drop this once a winner is picked and the losers are deleted.
  robots: { index: false, follow: false },
};

export default function Homepage3Page() {
  return (
    <div className={ibmPlexMono.variable}>
      <Homepage3 />
    </div>
  );
}
