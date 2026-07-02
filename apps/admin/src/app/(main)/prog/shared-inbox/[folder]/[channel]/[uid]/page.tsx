'use client';

// Shared Inbox — conversation detail (main content pane; shell/sidebar in ../../layout).
// HYBRID: mock rows (Email/Call/Live-chat/Social + seeded Text/WhatsApp) render the
// channel-adaptive static view; real Text(SMS)/WhatsApp rows load the live thread via
// /inbox/conversations and get a working composer + resolve. Realtime polling lands in
// Phase 3. Addressed by /prog/shared-inbox/<folder>/<prefix>/<uid> (e.g. /inbox/e/priya,
// /inbox/t/61438221004).
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/components/ui/toast';
import {
  claimConversation,
  getConversation,
  listConversations,
  markConversation,
  releaseConversation,
  sendInboxReply,
} from '@/lib/api';
import { getSession } from '@/lib/session';
import {
  ArrowLeft,
  Trash,
  Archive,
  Info,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Reply,
  ReplyAll,
  Forward,
  Paperclip,
  Phone,
  MessageSquare,
  Play,
  Send,
  Loader2,
  UserPlus,
  UserCheck,
} from 'lucide-react';
import {
  CHANNELS,
  conversationHref,
  conversations as mockSeed,
  findConversation,
  fromMock,
  fromRealRow,
  phoneSlug,
  unifiedInFolder,
  type RealChannel,
  type UnifiedConversation,
} from '../../../conversations';
import {
  matchesConversationFilter,
  matchesConversationSearch,
  parseFilter,
  sortConversations,
} from '@/lib/inbox/filters';
import { useRealtimeInbox } from '@/lib/inbox/use-realtime-inbox';

type ThreadMessage = {
  id: string;
  type: 'inbound' | 'outbound';
  at: string;
  body: string;
  from: string;
  to: string;
  channel?: RealChannel;
};

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function SharedInboxDetailPage() {
  const params = useParams();
  const search = useSearchParams();
  const router = useRouter();
  const { showToast } = useToast();

  const folder = String(params.folder ?? 'inbox');
  const prefix = String(params.channel ?? '');
  const uid = String(params.uid ?? '');
  const filter = parseFilter(search.get('filter'));
  const q = search.get('q') ?? '';
  const query = search.toString();
  const withQuery = (href: string) => `${href}${query ? `?${query}` : ''}`;
  const backHref = `/prog/shared-inbox/${folder}${query ? `?${query}` : ''}`;

  const mock = findConversation(prefix, uid);
  const isReal = !mock && (prefix === 't' || prefix === 'w');
  const realChannel: RealChannel = prefix === 'w' ? 'WHATSAPP' : 'SMS';

  // Real slice — for prev/next (unified folder list) + the current row's meta.
  const [realRows, setRealRows] = useState<UnifiedConversation[]>([]);
  useEffect(() => {
    let alive = true;
    void listConversations().then((res) => {
      if (alive && res.ok && Array.isArray(res.data)) {
        setRealRows((res.data as Record<string, unknown>[]).map(fromRealRow));
      }
    });
    return () => {
      alive = false;
    };
  }, []);
  const [currentUserId, setCurrentUserId] = useState<string>();
  useEffect(() => {
    void getSession().then((s) => {
      if (s) setCurrentUserId(s.id);
    });
  }, []);
  const realCurrent = realRows.find((u) => u.uid === uid && u.realChannel === realChannel);

  const folderList = useMemo(
    () =>
      sortConversations(
        [...mockSeed.map((c, i) => fromMock(c, i)), ...realRows].filter(
          (u) =>
            unifiedInFolder(u, folder, currentUserId) &&
            matchesConversationFilter(u, filter) &&
            matchesConversationSearch(u, q),
        ),
      ),
    [realRows, folder, filter, q, currentUserId],
  );
  const currentKey = mock ? `mock:${mock.id}` : realCurrent?.key;
  const index = currentKey ? folderList.findIndex((u) => u.key === currentKey) : -1;
  const prev = index > 0 ? folderList[index - 1] : undefined;
  const next = index >= 0 && index < folderList.length - 1 ? folderList[index + 1] : undefined;

  // Real thread state.
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const [sessionOpen, setSessionOpen] = useState(true);
  const [loadingThread, setLoadingThread] = useState(isReal);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [markedResolved, setMarkedResolved] = useState<boolean | null>(null);
  const resolved = markedResolved ?? realCurrent?.resolved ?? false;
  const [owner, setOwner] = useState<{ id: string; name: string } | null>(null);

  const loadThread = useCallback(
    async (withLoading = true) => {
      if (!isReal) return;
      if (withLoading) setLoadingThread(true);
      const res = await getConversation(uid, realChannel);
      if (res.ok) {
        const data = res.data as Record<string, unknown>;
        setThread((data.messages as ThreadMessage[]) || []);
        setSessionOpen(data.sessionOpen !== false);
        setOwner((data.owner as { id: string; name: string } | null) ?? null);
      }
      if (withLoading) setLoadingThread(false);
    },
    [isReal, uid, realChannel],
  );
  useEffect(() => {
    void loadThread();
  }, [loadThread]);
  // 4s poll + SSE for the open real thread (mirrors /inbox).
  useEffect(() => {
    if (!isReal) return;
    const id = window.setInterval(() => void loadThread(false), 4000);
    return () => window.clearInterval(id);
  }, [isReal, loadThread]);
  useRealtimeInbox((e) => {
    if (e.type !== 'inbox.inbound' && e.type !== 'inbox.reply') return;
    const phone = String((e.payload as { contactPhone?: unknown }).contactPhone ?? '');
    if (isReal && phoneSlug(phone) === uid) void loadThread(false);
  });

  const sendReply = async () => {
    if (!draft.trim() || sending) return;
    setSending(true);
    const body = draft;
    const at = new Date().toISOString();
    setDraft('');
    setThread((prev) => [...prev, { id: `optimistic-${Date.now()}`, type: 'outbound', at, body, from: 'You', to: uid }]);
    const sent = await sendInboxReply(uid, body, realChannel);
    setSending(false);
    if (!sent.ok) {
      setDraft(body);
      const closed = /SESSION_WINDOW_CLOSED/i.test(sent.error);
      if (closed) setSessionOpen(false);
      showToast({
        tone: 'error',
        title: closed ? 'WhatsApp session expired' : 'Send failed',
        description: closed
          ? 'The 24-hour window has closed — send an approved template blast to re-open it.'
          : sent.error,
      });
    } else {
      showToast({ tone: 'success', title: 'Reply sent' });
    }
    await loadThread(false);
  };

  const toggleResolve = async () => {
    const res = await markConversation(uid, !resolved, realChannel);
    if (res.ok) {
      setMarkedResolved(!resolved);
      showToast({ tone: 'success', title: !resolved ? 'Marked resolved' : 'Reopened' });
    }
  };

  const toggleClaim = async () => {
    const owned = !!owner;
    const res = owned ? await releaseConversation(uid, realChannel) : await claimConversation(uid, realChannel);
    if (res.ok) {
      setOwner(res.data.owner);
      showToast({ tone: 'success', title: owned ? 'Released' : 'Claimed' });
    }
  };

  if (!mock && !isReal) {
    return (
      <div className="xl:col-span-9 w-full">
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            That conversation could not be found (channel “{prefix}”, id “{uid}”).
          </p>
          <button
            onClick={() => router.push(backHref)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
          >
            <ArrowLeft className="h-4 w-4" /> Back to shared inbox
          </button>
        </div>
      </div>
    );
  }

  const channel = mock ? mock.channel : realChannel === 'WHATSAPP' ? 'WhatsApp' : 'Text';
  const senderName = mock ? mock.sender : realCurrent?.sender ?? uid;
  const identity = mock ? mock.identity : realCurrent?.identity ?? uid;
  const subject = mock ? mock.subject : realCurrent?.subject || 'Conversation';
  const isEmail = channel === 'Email';
  const isCall = channel === 'Call';

  return (
    <div className="xl:col-span-9 w-full">
      <div className="flex flex-col justify-between overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] xl:h-full">
        {/* Header */}
        <div className="flex flex-col justify-between border-b border-gray-200 dark:border-gray-800 sm:flex-row">
          <div className="flex items-center justify-between w-full gap-3 px-4 py-4 sm:justify-normal">
            <button
              onClick={() => router.push(backHref)}
              title="Back to shared inbox"
              className="flex h-10 w-full max-w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 hover:text-gray-800 dark:border-gray-800 dark:bg-white/[0.03] transition dark:text-gray-400 dark:hover:bg-white/[0.07] dark:hover:text-gray-200"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3">
              {isReal ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleResolve}
                    title={resolved ? 'Reopen' : 'Mark resolved'}
                    className={`flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition ${
                      resolved
                        ? 'border-brand-200 bg-brand-50 text-brand-600 dark:border-brand-500/30 dark:bg-brand-500/[0.12] dark:text-brand-400'
                        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-100 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400 dark:hover:bg-white/[0.07]'
                    }`}
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    {resolved ? 'Resolved' : 'Resolve'}
                  </button>
                  <button
                    onClick={toggleClaim}
                    title={owner ? 'Release' : 'Claim'}
                    className={`flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition ${
                      owner
                        ? 'border-brand-200 bg-brand-50 text-brand-600 dark:border-brand-500/30 dark:bg-brand-500/[0.12] dark:text-brand-400'
                        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-100 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400 dark:hover:bg-white/[0.07]'
                    }`}
                  >
                    {owner ? <UserCheck className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
                    {owner ? (owner.id === currentUserId ? 'Release' : owner.name) : 'Claim'}
                  </button>
                </div>
              ) : (
                <div className="flex">
                  <button title="Move to trash" className="flex h-10 w-10 items-center justify-center text-gray-500 ring-1 ring-inset ring-gray-200 first:rounded-l-lg last:rounded-r-lg hover:bg-gray-100 transition hover:text-error-500 dark:bg-white/[0.03] dark:text-gray-400 dark:ring-gray-700 dark:hover:bg-white/[0.05] dark:hover:text-error-500">
                    <Trash className="w-5 h-5" />
                  </button>
                  <button title="Details" className="-ml-px flex h-10 w-10 items-center justify-center text-gray-500 ring-1 ring-inset ring-gray-200 hover:bg-gray-100 transition hover:text-gray-700 dark:bg-white/[0.03] dark:text-gray-400 dark:ring-gray-700 dark:hover:bg-white/[0.05] dark:hover:text-white">
                    <Info className="w-5 h-5" />
                  </button>
                  <button title="Archive" className="-ml-px flex h-10 w-10 items-center justify-center rounded-r-lg text-gray-500 ring-1 ring-inset ring-gray-200 hover:bg-gray-100 hover:text-gray-700 dark:bg-white/[0.03] dark:text-gray-400 dark:ring-gray-700 dark:hover:bg-white/[0.05] transition dark:hover:text-white">
                    <Archive className="w-5 h-5" />
                  </button>
                </div>
              )}
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${CHANNELS[channel].labelColor}`}>{channel}</span>
            </div>
          </div>

          <div className="flex items-center justify-between w-full gap-4 px-4 py-3 border-t border-gray-200 dark:border-gray-800 sm:justify-end sm:border-t-0 sm:py-5">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {index >= 0 ? `${index + 1} of ${folderList.length}` : ''}
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                aria-label="Previous conversation"
                disabled={!prev}
                onClick={() => prev && router.push(withQuery(conversationHref(prev, folder)))}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-800 dark:bg-white/[0.03] dark:hover:text-gray-200 dark:text-gray-400 dark:hover:bg-white/[0.07] transition"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                aria-label="Next conversation"
                disabled={!next}
                onClick={() => next && router.push(withQuery(conversationHref(next, folder)))}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-800 dark:bg-white/[0.03] dark:hover:text-gray-200 dark:text-gray-400 dark:hover:bg-white/[0.07] transition"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Identity */}
        <div className="flex items-center gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <div className="w-11 h-11 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
            <span className="text-lg font-semibold text-gray-600 dark:text-gray-300">{senderName.charAt(0).toUpperCase()}</span>
          </div>
          <div>
            <span className="mb-0.5 block text-sm font-medium text-gray-800 dark:text-white/90">{subject}</span>
            <span className="block text-gray-500 text-xs dark:text-gray-400">
              {senderName} · {identity}
            </span>
          </div>
        </div>

        {/* Body */}
        {isReal ? (
          <RealThread
            thread={thread}
            loading={loadingThread}
            channel={realChannel}
            sessionOpen={sessionOpen}
            draft={draft}
            sending={sending}
            onDraft={setDraft}
            onSend={sendReply}
          />
        ) : (
          <MockBody conversation={mock!} isCall={isCall} isEmail={isEmail} />
        )}
      </div>
    </div>
  );
}

/** Real SMS/WhatsApp thread + composer (ported from /inbox). */
function RealThread({
  thread,
  loading,
  channel,
  sessionOpen,
  draft,
  sending,
  onDraft,
  onSend,
}: {
  thread: ThreadMessage[];
  loading: boolean;
  channel: RealChannel;
  sessionOpen: boolean;
  draft: string;
  sending: boolean;
  onDraft: (v: string) => void;
  onSend: () => void;
}) {
  const waClosed = channel === 'WHATSAPP' && !sessionOpen;
  return (
    <>
      <div className="flex-1 space-y-3 overflow-y-auto p-5 max-h-[420px] 2xl:max-h-[620px]">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500 dark:text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading conversation…
          </div>
        ) : thread.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">No messages yet.</p>
        ) : (
          thread.map((m) => {
            const isWa = (m.channel ?? channel) === 'WHATSAPP';
            const outbound = m.type === 'outbound';
            const tone = outbound
              ? isWa
                ? 'bg-[#dcf8c6] text-[#111b21] dark:bg-green-800 dark:text-white'
                : 'bg-brand-500 text-white'
              : isWa
                ? 'bg-[#f0f0f0] text-[#111b21] dark:bg-gray-800 dark:text-gray-100'
                : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
            return (
              <div key={m.id} className={`flex ${outbound ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${tone}`}>
                  <p className="whitespace-pre-line">{m.body}</p>
                  <p className="mt-1 text-[10px] opacity-70">{new Date(m.at).toLocaleTimeString()}</p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="sticky bottom-0 border-t border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-[#171f2f]">
        {waClosed ? (
          <div className="mb-2 rounded-lg border border-warning/40 bg-warning-container px-3 py-2 text-xs text-warning-foreground">
            WhatsApp 24-hour session has closed. Free-text replies are blocked — send an approved template blast to re-open it.
          </div>
        ) : null}
        <div className="flex items-end gap-2">
          <textarea
            className="min-h-[52px] w-full rounded-lg border border-gray-300 bg-transparent p-3 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 disabled:opacity-50 dark:border-gray-700 dark:text-white/90"
            placeholder={waClosed ? 'Session expired — template required' : 'Type your reply…'}
            value={draft}
            disabled={waClosed}
            onChange={(e) => onDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                onSend();
              }
            }}
          />
          <button
            type="button"
            onClick={onSend}
            disabled={waClosed || sending || !draft.trim()}
            className="flex h-11 shrink-0 items-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send
          </button>
        </div>
      </div>
    </>
  );
}

/** Mock channel-adaptive static render (Email/Call/Live-chat/Social + seeded rows). */
function MockBody({
  conversation,
  isCall,
  isEmail,
}: {
  conversation: NonNullable<ReturnType<typeof findConversation>>;
  isCall: boolean;
  isEmail: boolean;
}) {
  return (
    <>
      <div className="max-h-[440px] 2xl:max-h-[640px] overflow-y-auto">
        <div className="p-5 xl:p-6">
          {isCall && (
            <div className="mb-6 flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-900">
              <button className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500 text-white hover:bg-brand-600">
                <Play className="h-4 w-4" />
              </button>
              <div className="h-1.5 flex-1 rounded-full bg-gray-200 dark:bg-gray-700">
                <div className="h-full w-1/3 rounded-full bg-brand-500" />
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400">{formatDuration(conversation.durationSec ?? 0)}</span>
            </div>
          )}

          <div className="text-sm text-gray-500 mb-7 dark:text-gray-400 whitespace-pre-line">
            {isCall ? (
              <>
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-400">Transcript</span>
                {conversation.content}
              </>
            ) : (
              conversation.content
            )}
          </div>

          {conversation.attachments && conversation.attachments.length > 0 && (
            <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-900 sm:p-4">
              <div className="flex items-center gap-2 mb-5">
                <Paperclip className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                <span className="text-sm text-gray-700 dark:text-gray-400">{conversation.attachments.length} Attachments</span>
              </div>
              <div className="flex flex-col items-center gap-3 sm:flex-row">
                {conversation.attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="relative hover:border-gray-300 dark:hover:border-white/[0.05] flex w-full cursor-pointer items-center gap-3 rounded-xl border border-gray-200 bg-white py-2.5 pl-3 pr-5 dark:border-gray-800 dark:bg-white/5 sm:w-auto"
                  >
                    <div className="w-full h-10 max-w-10 bg-gray-100 dark:bg-gray-700 rounded flex items-center justify-center">
                      <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{attachment.type}</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-white/90">{attachment.name}</p>
                      <span className="flex items-center gap-1.5">
                        <span className="text-gray-500 text-xs dark:text-gray-400">{attachment.size}</span>
                        <span className="inline-block w-1 h-1 bg-gray-400 rounded-full"></span>
                        <span className="text-gray-500 text-xs dark:text-gray-400">Download</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="sticky bottom-0 border-t border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-[#171f2f]">
        <div className="flex flex-wrap sm:flex-row flex-col gap-3">
          {isCall ? (
            <>
              <FooterAction primary icon={<Phone className="w-5 h-5" />} label="Call back" />
              <FooterAction icon={<MessageSquare className="w-5 h-5" />} label="Send SMS" />
            </>
          ) : (
            <>
              <FooterAction icon={<Reply className="w-5 h-5" />} label="Reply" />
              {isEmail && <FooterAction icon={<ReplyAll className="w-5 h-5" />} label="Reply all" />}
              <FooterAction icon={<Forward className="w-5 h-5" />} label="Forward" />
            </>
          )}
        </div>
      </div>
    </>
  );
}

function FooterAction({ icon, label, primary }: { icon: ReactNode; label: string; primary?: boolean }) {
  return (
    <button
      className={
        primary
          ? 'items-center inline-flex justify-center gap-2 rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600'
          : 'items-center inline-flex justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-500 shadow-theme-xs hover:bg-gray-50 hover:text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03] dark:hover:text-gray-200'
      }
    >
      {icon}
      {label}
    </button>
  );
}
