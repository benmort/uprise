import { DispositionLayer, EngagementChannel } from "@yarns/db";

export type DispositionDefSeed = {
  code: string;
  label: string;
  layer: DispositionLayer;
  channel: EngagementChannel;
  isTerminal: boolean;
  isLocked: boolean;
  orderIndex: number;
};

/**
 * The shared, channel-aware disposition taxonomy (research synthesis §6). Two
 * layers: a contact-result layer (did we reach a human?) and a terminal /
 * data-quality layer that flags the shared record as bad. Support level is a
 * separate campaign-defined dimension stored on the Disposition, not here.
 *
 * Terminal codes are locked: they ship as system defaults (tenantId null)
 * and cannot be edited or deleted, so cross-org benchmarking stays consistent.
 */
export const DEFAULT_DISPOSITIONS: DispositionDefSeed[] = [
  // ── Contact result ──────────────────────────────────────────────
  { code: "spoke_to_target", label: "Spoke to target", layer: DispositionLayer.CONTACT_RESULT, channel: EngagementChannel.BOTH, isTerminal: false, isLocked: false, orderIndex: 10 },
  { code: "spoke_to_other", label: "Spoke to someone else", layer: DispositionLayer.CONTACT_RESULT, channel: EngagementChannel.BOTH, isTerminal: false, isLocked: false, orderIndex: 20 },
  { code: "not_home", label: "Not home", layer: DispositionLayer.CONTACT_RESULT, channel: EngagementChannel.DOOR, isTerminal: false, isLocked: false, orderIndex: 30 },
  { code: "no_answer", label: "No answer", layer: DispositionLayer.CONTACT_RESULT, channel: EngagementChannel.SMS, isTerminal: false, isLocked: false, orderIndex: 31 },
  { code: "come_back_later", label: "Come back later", layer: DispositionLayer.CONTACT_RESULT, channel: EngagementChannel.DOOR, isTerminal: false, isLocked: false, orderIndex: 40 },
  { code: "call_back", label: "Call back", layer: DispositionLayer.CONTACT_RESULT, channel: EngagementChannel.SMS, isTerminal: false, isLocked: false, orderIndex: 41 },
  { code: "refused", label: "Refused", layer: DispositionLayer.CONTACT_RESULT, channel: EngagementChannel.BOTH, isTerminal: false, isLocked: false, orderIndex: 50 },
  { code: "hostile", label: "Hostile", layer: DispositionLayer.CONTACT_RESULT, channel: EngagementChannel.BOTH, isTerminal: false, isLocked: false, orderIndex: 60 },

  // ── Terminal / data-quality (locked) ────────────────────────────
  { code: "moved", label: "Moved", layer: DispositionLayer.TERMINAL, channel: EngagementChannel.BOTH, isTerminal: true, isLocked: true, orderIndex: 100 },
  { code: "deceased", label: "Deceased", layer: DispositionLayer.TERMINAL, channel: EngagementChannel.BOTH, isTerminal: true, isLocked: true, orderIndex: 110 },
  { code: "do_not_contact", label: "Do not contact", layer: DispositionLayer.TERMINAL, channel: EngagementChannel.BOTH, isTerminal: true, isLocked: true, orderIndex: 120 },
  { code: "wrong_number", label: "Wrong number", layer: DispositionLayer.DATA_QUALITY, channel: EngagementChannel.SMS, isTerminal: true, isLocked: true, orderIndex: 130 },
  { code: "wrong_address", label: "Wrong address", layer: DispositionLayer.DATA_QUALITY, channel: EngagementChannel.DOOR, isTerminal: true, isLocked: true, orderIndex: 140 },
  { code: "language_barrier", label: "Language barrier", layer: DispositionLayer.DATA_QUALITY, channel: EngagementChannel.BOTH, isTerminal: false, isLocked: true, orderIndex: 150 },
];
