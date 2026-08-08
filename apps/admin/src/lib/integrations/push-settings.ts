import type { IntegrationDataSyncSettings } from "@uprise/api-client";

export type SyncStreamKey = "dispositions" | "surveyAnswers" | "tags" | "textReplies" | "rsvps";

export type PushSettings = {
  enabled: boolean;
  streams: Record<SyncStreamKey, boolean>;
};

/**
 * The write-back settings, read off a connection row's `settings` JSON.
 *
 * The defaults are not uniform and that is deliberate: most streams are opt-OUT (absent means on,
 * so a new connection pushes what an organiser would expect), while `textReplies` is opt-IN —
 * message bodies are the most sensitive thing here, so silence must mean "no".
 *
 * Extracted from sync-activity-card so it can be tested. It decides what every toggle in that card
 * renders as, and it was previously reachable only by mounting the component.
 */
export function parsePushSettings(
  settings: Record<string, unknown> | null | undefined,
): PushSettings {
  const push =
    settings && typeof settings === "object"
      ? ((settings as { dataSync?: { push?: Partial<IntegrationDataSyncSettings["push"]> } }).dataSync
          ?.push ?? {})
      : {};
  const streams = (push.streams ?? {}) as Partial<Record<SyncStreamKey, boolean>>;
  return {
    // Push itself is opt-IN: nothing leaves uprise until someone turns it on.
    enabled: push.enabled === true,
    streams: {
      dispositions: streams.dispositions !== false,
      surveyAnswers: streams.surveyAnswers !== false,
      tags: streams.tags !== false,
      // Opt-in: reply BODIES are the most sensitive stream.
      textReplies: streams.textReplies === true,
      rsvps: streams.rsvps !== false,
    },
  };
}

/**
 * Fold a saved `IntegrationDataSyncSettings` response back into the local view.
 *
 * The card renders its switches from a prop the parent holds in plain `useState`, and the save
 * handlers called `invalidateApi("/integrations/connections")` — which walks the useApi cache and
 * revalidates entries that have listeners. No `useApi` holder of that key is mounted on this page
 * (the only one lives on a different route), so it was a complete no-op: the PATCH persisted, a
 * green toast said "Push to NationBuilder is on", and the switch never moved. Radix's Switch is
 * fully controlled, so it did not even animate. Worse for the per-stream rows, which have no
 * toast at all: turning one off appeared to do nothing, and a second click PATCHed it back on.
 *
 * The API returns the saved settings, so the honest fix is to render from the response.
 */
export function applyPushResponse(
  current: PushSettings,
  response: IntegrationDataSyncSettings | null | undefined,
): PushSettings {
  const push = response?.push;
  if (!push) return current;
  const streams = (push.streams ?? {}) as Partial<Record<SyncStreamKey, boolean>>;
  return {
    enabled: push.enabled === true,
    streams: {
      dispositions: streams.dispositions ?? current.streams.dispositions,
      surveyAnswers: streams.surveyAnswers ?? current.streams.surveyAnswers,
      tags: streams.tags ?? current.streams.tags,
      textReplies: streams.textReplies ?? current.streams.textReplies,
      rsvps: streams.rsvps ?? current.streams.rsvps,
    },
  };
}
