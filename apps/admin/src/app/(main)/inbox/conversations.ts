// Shared Inbox — mock data + channel config, shared by the list and the per-channel
// detail route. Each conversation is addressed by a channel-scoped path
// (/inbox/<folder>/<prefix>/<uid>, e.g. /inbox/inbox/e/priya for email) so a loaded
// resource has a dedicated, shareable URL. Wiring this to the real inbox API (keyed by
// the same channel + uid) is the next step.

import type { FeatureFlagKey } from '@uprise/flags';

export type Channel = 'Email' | 'WhatsApp' | 'Text' | 'Call' | 'Live chat' | 'Social';

/** Per-channel routing prefix + pill colour. The prefix is the URL segment. */
export const CHANNELS: Record<Channel, { prefix: string; labelColor: string }> = {
  Email: { prefix: 'e', labelColor: 'bg-indigo-100 text-indigo-700' },
  WhatsApp: { prefix: 'w', labelColor: 'bg-green-100 text-green-700' },
  Text: { prefix: 't', labelColor: 'bg-blue-100 text-blue-700' },
  Call: { prefix: 'c', labelColor: 'bg-orange-100 text-orange-700' },
  'Live chat': { prefix: 'l', labelColor: 'bg-sky-100 text-sky-700' },
  Social: { prefix: 's', labelColor: 'bg-pink-100 text-pink-700' },
};

export const CHANNEL_BY_PREFIX: Record<string, Channel> = Object.fromEntries(
  (Object.keys(CHANNELS) as Channel[]).map((ch) => [CHANNELS[ch].prefix, ch]),
) as Record<string, Channel>;

// ── Channel filter (plan-gated) ─────────────────────────────────────────────
// The shared-inbox list can be narrowed to one channel. Only channels with a real
// inbox backend are offered: Text (SMS) is the always-on baseline; WhatsApp rides
// the plan's FEATURE_WHATSAPP_ENABLED. Email/Call/Live-chat/Social have no inbound
// pipeline yet (they'd only ever show an empty list), so they aren't offered — add
// an entry here (with its plan flag) when their inbox ships. The list only surfaces
// the channel control when 2+ of these are plan-enabled (see folder-view).
export type ChannelFilter = 'all' | 'text' | 'whatsapp';

export const CHANNEL_FILTERS: Array<{ key: Exclude<ChannelFilter, 'all'>; channel: Channel; flag?: FeatureFlagKey }> = [
  { key: 'text', channel: 'Text' },
  { key: 'whatsapp', channel: 'WhatsApp', flag: 'FEATURE_WHATSAPP_ENABLED' },
];

/** Parse the `?channel=` param to a known filter key, defaulting to 'all'. */
export function parseChannelFilter(value: string | null | undefined): ChannelFilter {
  return value === 'text' || value === 'whatsapp' ? value : 'all';
}

/** Whether a unified row matches the active channel filter ('all' matches every row). */
export function matchesConversationChannel(row: { channel: Channel }, channel: ChannelFilter): boolean {
  if (channel === 'all') return true;
  const opt = CHANNEL_FILTERS.find((c) => c.key === channel);
  return !!opt && row.channel === opt.channel;
}

/** Sidebar folders — the URL path segment + its display label. */
export const FOLDERS = [
  { key: 'inbox', label: 'Unified inbox' },
  { key: 'mine', label: 'Assigned to me' },
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'sent', label: 'Sent' },
  { key: 'drafts', label: 'Drafts' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'trash', label: 'Trash' },
] as const;
export type FolderKey = (typeof FOLDERS)[number]['key'];
export const DEFAULT_FOLDER: FolderKey = 'inbox';

/** localStorage keys — resume the last folder/filter, and the client-only star overlay
 *  for real rows (the inbox API has no star). */
export const SHARED_INBOX_ROUTE_KEY = 'uprise.sharedInbox.routeState';
export const SHARED_INBOX_STARS_KEY = 'uprise.sharedInbox.stars';
export function folderLabel(key: string): string {
  return FOLDERS.find((f) => f.key === key)?.label ?? 'Inbox';
}

export type ConversationStatus = 'inbox' | 'trash' | 'archived';

export interface Attachment {
  id: string;
  name: string;
  type: string;
  size: string;
}

export interface Conversation {
  id: string;
  /** URL slug within a channel (the `uid`). */
  uid: string;
  channel: Channel;
  sender: string;
  /** Channel-appropriate handle: email address, phone number, @handle or source. */
  identity: string;
  subject: string;
  preview: string;
  content: string;
  time: string;
  isStarred: boolean;
  isRead: boolean;
  status: ConversationStatus;
  /** Voicemail length for Call items. */
  durationSec?: number;
  attachments?: Attachment[];
}

// Mock cross-channel seed removed — the shared inbox now renders only real SMS/WhatsApp
// conversations from listConversations(). Email/Call/Live-chat/Social land here when their
// backends ship (parked). Kept as an empty export so callers/merge plumbing stay inert.
export const conversations: Conversation[] = [];

/** The list-view URL for a folder. The default folder lives at the bare /inbox; the
 *  others nest under it. Conversations always keep the folder segment (see
 *  {@link conversationHref}) because the detail route is /inbox/[folder]/[channel]/[uid]. */
export function folderPath(folder: string): string {
  return folder === DEFAULT_FOLDER ? '/inbox' : `/inbox/${folder}`;
}

/** The dedicated, shareable path for a conversation, nested under its folder:
 *  /inbox/<folder>/<prefix>/<uid>. */
export function conversationHref(
  c: Pick<Conversation, 'channel' | 'uid'>,
  folder: string = DEFAULT_FOLDER,
): string {
  return `/inbox/${folder}/${CHANNELS[c.channel].prefix}/${c.uid}`;
}

/** Which folder a mock conversation belongs to. Mock has no owner, so mine/unassigned
 *  fall back to the inbox; sent/drafts have no seed data. */
export function mockInFolder(c: Conversation, folder: string): boolean {
  if (folder === 'trash') return c.status === 'trash';
  if (folder === 'resolved') return c.status === 'archived';
  if (folder === 'sent' || folder === 'drafts') return false;
  return c.status === 'inbox'; // inbox / mine / unassigned
}

/** Resolve a conversation from its channel prefix + uid (the route params). */
export function findConversation(prefix: string, uid: string): Conversation | undefined {
  const channel = CHANNEL_BY_PREFIX[prefix];
  if (!channel) return undefined;
  return conversations.find((c) => c.uid === uid && c.channel === channel);
}

// ── Unified model: real SMS/WhatsApp rows + mock rows normalise into one shape ──────

export type RealChannel = 'SMS' | 'WHATSAPP';

export interface UnifiedConversation {
  source: 'real' | 'mock';
  /** React key + selection id. */
  key: string;
  channel: Channel;
  /** URL slug — mock uid, or the real contact's digits. */
  uid: string;
  sender: string;
  identity: string;
  subject: string;
  preview: string;
  time: string;
  sortAt: number;
  isRead: boolean;
  isStarred: boolean;
  resolved: boolean;
  unreadCount: number;
  owner: { id: string; name: string } | null;
  contactPhone?: string;
  realChannel?: RealChannel;
  /** The underlying mock row (carries content/attachments to the detail). */
  mock?: Conversation;
}

/** Digits-only slug for a phone number (the real conversation's `uid`). */
export function phoneSlug(phone: string): string {
  return phone.replace(/\D/g, '');
}

// Mock rows have no reliable timestamps, so pin them just beneath live traffic in
// stable seed order.
const MOCK_BASELINE = Date.UTC(2026, 0, 1);

export function fromMock(c: Conversation, index: number): UnifiedConversation {
  return {
    source: 'mock',
    key: `mock:${c.id}`,
    channel: c.channel,
    uid: c.uid,
    sender: c.sender,
    identity: c.identity,
    subject: c.subject,
    preview: c.preview,
    time: c.time,
    sortAt: MOCK_BASELINE - index * 3_600_000,
    isRead: c.isRead,
    isStarred: c.isStarred,
    resolved: c.status === 'archived',
    unreadCount: c.isRead ? 0 : 1,
    owner: null,
    mock: c,
  };
}

function relativeTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/** Normalise a raw `/inbox/conversations` row (real SMS/WhatsApp) into the unified shape. */
export function fromRealRow(row: Record<string, unknown>): UnifiedConversation {
  const contactPhone = String(row.contactPhone ?? '');
  const realChannel: RealChannel = String(row.channel ?? 'SMS').toUpperCase() === 'WHATSAPP' ? 'WHATSAPP' : 'SMS';
  const channel: Channel = realChannel === 'WHATSAPP' ? 'WhatsApp' : 'Text';
  const unreadCount = Number(row.unreadCount ?? 0);
  const resolved = Boolean(row.resolved);
  const lastAt = row.lastMessageAt ? String(row.lastMessageAt) : '';
  const ownerRaw = row.owner as { id?: unknown; name?: unknown } | null | undefined;
  const owner = ownerRaw && ownerRaw.id ? { id: String(ownerRaw.id), name: String(ownerRaw.name ?? '') } : null;
  return {
    source: 'real',
    key: `real:${realChannel}:${contactPhone}`,
    channel,
    uid: phoneSlug(contactPhone),
    sender: row.contactName ? String(row.contactName) : contactPhone,
    identity: contactPhone,
    subject: '',
    preview: '',
    time: lastAt ? relativeTime(lastAt) : '',
    sortAt: lastAt ? Date.parse(lastAt) : Date.now(),
    isRead: unreadCount === 0,
    isStarred: false,
    resolved,
    unreadCount,
    owner,
    contactPhone,
    realChannel,
  };
}

/** Which folder a unified conversation belongs to. Owner-based folders (mine/unassigned)
 *  are real-only; mock lives in inbox/resolved/trash; sent/drafts have no data yet. */
export function unifiedInFolder(u: UnifiedConversation, folder: string, currentUserId?: string): boolean {
  if (u.source === 'mock') {
    if (folder === 'trash') return u.mock?.status === 'trash';
    if (folder === 'resolved') return u.mock?.status === 'archived';
    return folder === 'inbox' && u.mock?.status === 'inbox';
  }
  if (folder === 'inbox') return !u.resolved;
  if (folder === 'resolved') return u.resolved;
  if (folder === 'mine') return !!u.owner && (!currentUserId || u.owner.id === currentUserId);
  if (folder === 'unassigned') return !u.owner && !u.resolved;
  return false; // sent / drafts / trash — no real data
}
