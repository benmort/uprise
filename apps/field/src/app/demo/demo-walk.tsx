"use client";

import { WalkView } from "@uprise/field";
import { DEMO_ASSIGNMENT, DEMO_POSITION, DEMO_ROUTE, DEMO_TURF_ID } from "./fixture";

/**
 * Client shell for the demo walk view. Exists because `buildDoorHref` is a function and the
 * demo page is a server component — a function prop cannot cross that boundary, so the page
 * renders this wrapper and the wrapper builds the door links.
 *
 * The door taps land on `/demo/door/[stopId]` — the demo's own door screen (dispositions +
 * survey over fixture data, nothing saved), NOT the gated live door form. `?embed=1` rides
 * along so the door screen stays as chromeless as the walk view it came from.
 */
export function DemoWalk({ embedded }: { embedded: boolean }) {
  return (
    <WalkView
      turfId={DEMO_TURF_ID}
      readOnly
      // Only in the embed: there the page IS the phone screen, so the map should run to the
      // bottom. Standalone, the "Demo data" notice sits above it and a viewport-height column
      // would push itself into a scroll.
      fillViewport={embedded}
      // Open on the map. This is a tour, not a shift: the map is what reads as a canvassing app
      // at a glance, where the list is a column of addresses that could be anything. The live app
      // still opens on the list, and a visitor who switches here is still remembered.
      defaultMode="map"
      // No "Scroll to zoom" checkbox. It sets a cross-map preference that isn't a visitor's to
      // set, and turning cooperative gestures off inside the homepage's iframe would mean a
      // scroll over the phone zoomed the map instead of scrolling the page past it.
      mapGestureToggle={false}
      assignment={DEMO_ASSIGNMENT}
      sampleUserPosition={DEMO_POSITION}
      routeGeometry={DEMO_ROUTE}
      buildDoorHref={(stopId) =>
        `/demo/door/${encodeURIComponent(stopId)}${embedded ? "?embed=1" : ""}`
      }
    />
  );
}
