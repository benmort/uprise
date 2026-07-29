import type { Metadata } from "next";
import { WalkView } from "@uprise/field";
import { DEMO_ASSIGNMENT, DEMO_POSITION, DEMO_ROUTE, DEMO_TURF_ID } from "./fixture";

/**
 * /demo — the canvasser walk view, open to anyone.
 *
 * This is the REAL screen: the same <WalkView> a volunteer uses, rendered read-only over fixture
 * data (see fixture.ts). uprise.org.au embeds it in a phone frame so a visitor can browse the app
 * before signing up, which is why the route is exempt from the SSO gate in src/middleware.ts and
 * why FieldShell skips its session boot for `/demo`.
 *
 * Two properties hold this together, and both must survive any change here:
 *   1. It renders no real data. `assignment` is passed in, so WalkView never fetches a
 *      volunteer-scoped payload — an unauthenticated page cannot leak a supporter's address.
 *   2. It writes nothing. `readOnly` hides the knock controls, so there is no path from here into
 *      the door form (which is gated) or the outbox.
 */
export const metadata: Metadata = {
  title: "Uprise Field — demo walk list",
  description: "A read-only tour of the Uprise canvasser app, running on demo data.",
  // Embedded on the homepage and full of invented residents — it should never rank.
  robots: { index: false, follow: false },
};

export default function DemoWalkPage() {
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-border bg-surface-variant px-3.5 py-2.5">
        <p className="text-xs font-semibold text-foreground">Demo data</p>
        <p className="text-xs text-muted-foreground">
          A sample walk list — every resident and outcome here is invented. Sign up to walk a real
          one.
        </p>
      </div>

      <WalkView
        turfId={DEMO_TURF_ID}
        readOnly
        assignment={DEMO_ASSIGNMENT}
        sampleUserPosition={DEMO_POSITION}
        routeGeometry={DEMO_ROUTE}
      />
    </div>
  );
}
