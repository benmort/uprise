import type { Metadata } from "next";
import { DemoChrome } from "../../demo-chrome";
import { DemoDoor } from "./demo-door";

/**
 * /demo/door/[stopId] — the demo's door screen, open to anyone (the `demo(?:$|/)` middleware
 * exemption covers it). Reached only from the demo walk view's door taps.
 *
 * The same two properties as /demo hold here:
 *   1. No real data — the stop, the outcome catalogue and the survey all come from fixture.ts.
 *   2. No writes — an outcome or a completed survey shows a "demo only" toast and returns to
 *      the walk list. Nothing reaches the outbox, IndexedDB or the API.
 */
export const metadata: Metadata = {
  title: "Uprise Field — demo door",
  description: "Knock a fixture door: dispositions and the survey, running on demo data.",
  // Same as /demo: full of invented residents — it should never rank.
  robots: { index: false, follow: false },
};

export default function DemoDoorPage({
  params,
  searchParams,
}: {
  params: { stopId: string };
  searchParams?: { embed?: string };
}) {
  // Same contract as /demo: `?embed=1` means the marketing phone frame, which has already
  // disclosed the demo data, so the notice stays off and the screen keeps its full height.
  const embedded = searchParams?.embed === "1";
  return (
    <DemoChrome embedded={embedded}>
      <DemoDoor stopId={params.stopId} embedded={embedded} />
    </DemoChrome>
  );
}
