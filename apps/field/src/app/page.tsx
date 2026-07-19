import { Assignments } from "@uprise/field";

/**
 * The field app's home — the canvasser's assignments — served at the bare root so the
 * domain itself (field.uprise.org.au) IS the home. It's also the PWA `start_url`.
 *
 * The root `/` is deliberately left UNCACHED by the service worker (see next.config.mjs):
 * the SSO middleware redirect (307 → auth app) must pass through, and caching it would
 * replay the auth bounce forever. Rendering (not redirecting) here keeps the root
 * network-only + loop-free while landing signed-in canvassers straight on their
 * assignments. Every OTHER screen (`/[turfId]`, `/shifts`, …) IS offline-cached, so a
 * killed screen tab reopens from the shell cache; only a cold icon-open while offline
 * falls back to `/offline`.
 */
export default function HomePage() {
  return <Assignments />;
}
