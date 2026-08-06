/**
 * Per-connection data-sync settings, stored as one `dataSync` blob on
 * `IntegrationConnection.settings` (beside the existing `baseUrl`). One JSON shape, one
 * parser with hard defaults, so an old connection with no blob — or a blob from before a
 * field existed — behaves identically to a freshly saved one.
 *
 * Pull defaults are ON (importing what the nation already has is the feature's point);
 * the push master switch is OFF (write-back to a client's CRM is an explicit, per-nation
 * opt-in — see the data-sync plan's rollout gates). `supportLevelRequiresConsent` is not
 * configurable: support level is political-opinion data (Privacy Act APP 3), so the
 * per-row consent gate always applies when support levels are pushed at all.
 */

export type DataSyncPushStreams = {
  dispositions: boolean;
  surveyAnswers: boolean;
  tags: boolean;
  /** Full inbound message bodies into the CRM — off until the org opts in (privacy). */
  textReplies: boolean;
  rsvps: boolean;
};

export type DataSyncSettings = {
  pull: {
    /** Mirror NationBuilder person tags onto uprise contact tags on import. */
    importTags: boolean;
    autoRefresh: { enabled: boolean; intervalHours: number };
  };
  push: {
    /** Master switch — nothing pushes while this is off. */
    enabled: boolean;
    streams: DataSyncPushStreams;
    /** Owner decision: on by default, but every pushed support level still needs the row's consent. */
    supportLevelsEnabled: boolean;
    /** Always true — kept in the shape so the worker reads one object, but not parsed from input. */
    supportLevelRequiresConsent: true;
    /** Create people in the CRM for uprise-originated contacts (via NB people/push upsert). */
    createMissingPeople: boolean;
    /** Optional prefix for tags uprise writes to the CRM ("" = write keys as-is). */
    tagPrefix: string;
    /** NB user id that contact logs are attributed to (null = the token's user). */
    nbSenderId: number | null;
  };
};

const DEFAULTS: DataSyncSettings = {
  pull: {
    importTags: true,
    autoRefresh: { enabled: true, intervalHours: 24 },
  },
  push: {
    enabled: false,
    streams: { dispositions: true, surveyAnswers: true, tags: true, textReplies: false, rsvps: true },
    supportLevelsEnabled: true,
    supportLevelRequiresConsent: true,
    createMissingPeople: true,
    tagPrefix: "",
    nbSenderId: null,
  },
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** Parse a connection's `settings` JSON into a fully defaulted DataSyncSettings. */
export function parseDataSyncSettings(settings: unknown): DataSyncSettings {
  const dataSync = asRecord(asRecord(settings).dataSync);
  const pull = asRecord(dataSync.pull);
  const autoRefresh = asRecord(pull.autoRefresh);
  const push = asRecord(dataSync.push);
  const streams = asRecord(push.streams);
  const intervalRaw = Number(autoRefresh.intervalHours);
  const nbSenderRaw = Number(push.nbSenderId);
  return {
    pull: {
      importTags: bool(pull.importTags, DEFAULTS.pull.importTags),
      autoRefresh: {
        enabled: bool(autoRefresh.enabled, DEFAULTS.pull.autoRefresh.enabled),
        intervalHours:
          Number.isFinite(intervalRaw) && intervalRaw >= 1
            ? Math.min(24 * 7, Math.trunc(intervalRaw))
            : DEFAULTS.pull.autoRefresh.intervalHours,
      },
    },
    push: {
      enabled: bool(push.enabled, DEFAULTS.push.enabled),
      streams: {
        dispositions: bool(streams.dispositions, DEFAULTS.push.streams.dispositions),
        surveyAnswers: bool(streams.surveyAnswers, DEFAULTS.push.streams.surveyAnswers),
        tags: bool(streams.tags, DEFAULTS.push.streams.tags),
        textReplies: bool(streams.textReplies, DEFAULTS.push.streams.textReplies),
        rsvps: bool(streams.rsvps, DEFAULTS.push.streams.rsvps),
      },
      supportLevelsEnabled: bool(push.supportLevelsEnabled, DEFAULTS.push.supportLevelsEnabled),
      supportLevelRequiresConsent: true,
      createMissingPeople: bool(push.createMissingPeople, DEFAULTS.push.createMissingPeople),
      tagPrefix: typeof push.tagPrefix === "string" ? push.tagPrefix.trim() : DEFAULTS.push.tagPrefix,
      nbSenderId: Number.isFinite(nbSenderRaw) && nbSenderRaw > 0 ? Math.trunc(nbSenderRaw) : null,
    },
  };
}
