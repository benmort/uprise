import type { Cycle } from "@/lib/queue-firehose";

/**
 * Prototype fixtures. Every scenario below is a real one from this platform — the Action Network
 * sync that failed on a credential mismatch for months, the blast that is mid-flight, the turf
 * estimate that is genuinely just slow. Designing against real failures is the only way to find
 * out whether the surface says anything useful when things go wrong.
 *
 * Replace `AI_READ` with a call to the AI service and `QUEUES` with GET /observability/queue/jobs.
 */

export type AiRead = {
  /** One word the eye lands on first. */
  verdictLabel: string;
  /** What is happening — the sentence that replaces "Sync queued (job cmsi3zl3)". */
  reading: string;
  /** What to do about it. Empty when there is nothing to do but wait. */
  advice?: string;
};

export type PrototypeQueue = {
  key: string;
  name: string;
  /** What this queue does, in the operator's words rather than the system's. */
  subtitle: string;
  jobLabel: string;
  jobId: string;
  cycles: Cycle[];
  /** Epoch ms of the next scheduled attempt, when there is one. */
  nextRunAt?: number;
  attemptsMade: number;
  attemptsAllowed: number;
  ai: AiRead;
  events: Array<{ at: string; level: "info" | "warn" | "error"; text: string }>;
};

const T = (iso: string) => iso;

export const QUEUES: PrototypeQueue[] = [
  {
    key: "integration-sync",
    name: "Contact imports",
    subtitle: "Pulling people in from Action Network",
    jobLabel: "Action Network · Aug 8 – EOI No Ticket",
    jobId: "cmsi3zl3",
    attemptsMade: 4,
    attemptsAllowed: 19,
    nextRunAt: Date.parse("2026-08-16T02:14:00Z"),
    cycles: [
      { attempt: 1, at: T("2026-08-06T04:14:18Z"), outcome: "failed", error: "Credential could not be decrypted" },
      { attempt: 2, at: T("2026-08-06T04:23:50Z"), outcome: "failed", error: "Credential could not be decrypted" },
      { attempt: 3, at: T("2026-08-06T04:42:50Z"), outcome: "failed", error: "Credential could not be decrypted" },
      { attempt: 4, at: T("2026-08-06T06:36:59Z"), outcome: "failed", error: "Credential could not be decrypted" },
      { attempt: 5, at: T("2026-08-16T02:14:00Z"), outcome: "waiting" },
    ],
    ai: {
      verdictLabel: "Stuck, not slow",
      reading:
        "Four attempts, all refused at the same point: the worker cannot decrypt the Action Network key this list is connected with. No contacts have been pulled and none will be until the key is readable.",
      advice:
        "The API and the worker are holding different INTEGRATION_CREDENTIAL_SECRET values. Align them, then re-sync — the fifth attempt is otherwise ten days away.",
    },
    events: [
      { at: "06:36:59", level: "error", text: "[integrations] Sync credential could not be decrypted {\"syncJobId\":\"cmsi3zl3\",\"type\":\"ACTION_NETWORK\"}" },
      { at: "06:36:59", level: "warn", text: "[queue] attempt 4/19 failed — backing off 9d 20h" },
      { at: "04:42:50", level: "error", text: "[integrations] Sync credential could not be decrypted {\"syncJobId\":\"cmsi3zl3\"}" },
      { at: "04:23:50", level: "error", text: "[integrations] Sync credential could not be decrypted {\"syncJobId\":\"cmsi3zl3\"}" },
      { at: "04:14:18", level: "info", text: "[integrations] Sync requested — list bf9a5318, 0 pages fetched" },
    ],
  },
  {
    key: "blast-send",
    name: "Message sending",
    subtitle: "Texts and WhatsApp going out",
    jobLabel: "Blast · Rally reminder — Fitzroy",
    jobId: "cmsh8p2q",
    attemptsMade: 1,
    attemptsAllowed: 19,
    cycles: [
      { attempt: 1, at: T("2026-08-07T00:58:00Z"), outcome: "advanced", detail: "batch 1 · 500 sent" },
      { attempt: 2, at: T("2026-08-07T00:59:10Z"), outcome: "advanced", detail: "batch 2 · 500 sent" },
      { attempt: 3, at: T("2026-08-07T01:00:20Z"), outcome: "advanced", detail: "batch 3 · 500 sent" },
      { attempt: 4, at: T("2026-08-07T01:01:30Z"), outcome: "running", detail: "batch 4 · 312 of 500" },
    ],
    ai: {
      verdictLabel: "Sending steadily",
      reading:
        "1,812 of 2,400 messages away across four batches, holding about 430 a minute with no carrier rejections.",
      advice: "Nothing to do. On this pace the last message lands in roughly 90 seconds.",
    },
    events: [
      { at: "01:01:30", level: "info", text: "[blasts] batch 4 started — 500 recipients" },
      { at: "01:00:20", level: "info", text: "[blasts] batch 3 complete {\"sent\":500,\"failed\":0}" },
      { at: "00:59:10", level: "info", text: "[blasts] batch 2 complete {\"sent\":500,\"failed\":0}" },
      { at: "00:58:00", level: "info", text: "[blasts] batch 1 complete {\"sent\":500,\"failed\":0}" },
    ],
  },
  {
    key: "turf-estimate",
    name: "Turf pricing",
    subtitle: "Working out how long a walk takes",
    jobLabel: "Turf · Kew — 28,580 buildings",
    jobId: "cmsh4k1w",
    attemptsMade: 1,
    attemptsAllowed: 19,
    cycles: [
      { attempt: 1, at: T("2026-08-07T00:30:00Z"), outcome: "running", detail: "742 of 1,191 route requests" },
    ],
    ai: {
      verdictLabel: "Slow on purpose",
      reading:
        "One long cycle, 742 of 1,191 walking-route requests done. This queue runs one job at a time because two would fight over the same Mapbox quota.",
      advice: "Nothing to do. Large turfs take about 20 minutes; this one is around 12 minutes in.",
    },
    events: [
      { at: "00:42:11", level: "info", text: "[canvassing] route batch 742/1191 {\"turfId\":\"cmsh4k1w\"}" },
      { at: "00:30:00", level: "info", text: "[canvassing] turf estimate started — 28,580 buildings" },
    ],
  },
  {
    key: "segment-eval",
    name: "Segment rebuilds",
    subtitle: "Re-checking who belongs to a saved list",
    jobLabel: "Segment · Imported contacts",
    jobId: "cmsh0aa2",
    attemptsMade: 0,
    attemptsAllowed: 19,
    cycles: [],
    ai: {
      verdictLabel: "Nothing waiting",
      reading: "No segment has needed rebuilding since 04:12. The queue is empty and the worker is listening.",
    },
    events: [{ at: "04:12:02", level: "info", text: "[audiences] segment eval complete {\"members\":1204}" }],
  },
  {
    key: "domain-events",
    name: "Event fan-out",
    subtitle: "Reactions to things that happened",
    jobLabel: "Outbox relay",
    jobId: "relay",
    attemptsMade: 0,
    attemptsAllowed: 19,
    cycles: [
      { attempt: 1, at: T("2026-08-07T01:01:40Z"), outcome: "advanced", detail: "12 events published" },
      { attempt: 2, at: T("2026-08-07T01:01:41Z"), outcome: "advanced", detail: "8 events published" },
      { attempt: 3, at: T("2026-08-07T01:01:42Z"), outcome: "advanced", detail: "0 events — idle" },
    ],
    ai: {
      verdictLabel: "Keeping up",
      reading: "Draining every 750ms with nothing backed up. The last event was published a second after it happened.",
    },
    events: [
      { at: "01:01:42", level: "info", text: "[worker] outbox drain — 0 unpublished" },
      { at: "01:01:41", level: "info", text: "[worker] outbox drain — 8 published" },
    ],
  },
];
