import { Assignments } from "@uprise/field";

/**
 * The field app's home — the canvasser's assignments — served at the bare root so the
 * domain itself (field.uprise.org.au) IS the home, rather than bouncing to /field.
 *
 * `/field` still renders the same screen and stays the canonical/offline home: it's the
 * PWA `start_url` and the only path the service-worker shell cache covers (see
 * next.config.mjs). `/` is deliberately left uncached there — the SSO middleware redirect
 * must pass through — so rendering (not redirecting) here keeps the root network-only and
 * loop-free while still landing signed-in canvassers straight on their assignments.
 */
export default function HomePage() {
  return <Assignments />;
}
