import type { Metadata } from "next";
import { DemoChrome } from "./demo-chrome";
import { DemoWalk } from "./demo-walk";

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
 *   2. It writes nothing. `readOnly` disables the live knock flow; door taps land on the demo's
 *      own `/demo/door/[stopId]` screen (dispositions + survey over fixture data, see
 *      demo-walk.tsx), which records to a toast and never touches the outbox or the API.
 */
export const metadata: Metadata = {
  title: "Uprise Field — demo walk list",
  description: "A read-only tour of the Uprise canvasser app, running on demo data.",
  // Embedded on the homepage and full of invented residents — it should never rank.
  robots: { index: false, follow: false },
};

export default function DemoWalkPage({
  searchParams,
}: {
  searchParams?: { embed?: string };
}) {
  /**
   * `?embed=1` drops the "Demo data" callout — set only by the marketing phone frame
   * (product-marketing CanvassDemoFrame). Two reasons it goes there and only there: the homepage
   * section around the phone already says the app is running on demo data, so the notice repeats
   * a disclosure the visitor has just read; and in a ~232px-wide phone it costs a third of the
   * screen that should be showing the walk list.
   *
   * Opened directly, /demo KEEPS it. A page of invented residents with nothing saying so could be
   * taken for a real volunteer's round, and the "Open the app" link in the frame deliberately
   * points at the un-embedded URL so anyone who follows it out sees the notice.
   */
  const embedded = searchParams?.embed === "1";

  return (
    <DemoChrome embedded={embedded}>
      <div className="flex flex-col gap-3">
        {embedded ? null : (
          <div className="rounded-xl border border-border bg-surface-variant px-3.5 py-2.5">
            <p className="text-xs font-semibold text-foreground">Demo data</p>
            <p className="text-xs text-muted-foreground">
              A sample walk list — every resident and outcome here is invented. Sign up to walk a
              real one.
            </p>
          </div>
        )}

        <DemoWalk embedded={embedded} />
      </div>
    </DemoChrome>
  );
}
