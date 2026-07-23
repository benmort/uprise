"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Inbox, Send, SkipForward } from "lucide-react";
import { Button, EmptyState, Skeleton, Spinner, StatusBadge, cn, useToast } from "@uprise/ui";
import { searchContacts } from "../api/contacts";
import {
  recordTextingDisposition,
  recordTextingSurveyAnswer,
  sendTextingInitial,
  sendTextingReply,
} from "../api/texting";
import { useTextingFlow, useTextingQueue, useTextingThread } from "../hooks/use-texting";
import { CannedResponsePicker } from "../components/canned-response-picker";
import { ScriptAssistPanel } from "../components/script-assist-panel";
import { SurveyRunner, type SurveyAnswer, type SurveySchema } from "../components/survey-runner";
import { ProgressBar } from "../components/progress-bar";

type SurveyLike = {
  id: string;
  name: string;
  entryQuestionKey?: string | null;
  questions: Array<{
    id: string;
    key?: string;
    prompt: string;
    type: SurveySchema["questions"][number]["type"];
    scaleMin?: number | null;
    scaleMax?: number | null;
    defaultNextQuestionKey?: string | null;
    options?: Array<{
      id: string;
      value: string;
      label: string;
      nextQuestionKey?: string | null;
      isTerminal?: boolean;
    }>;
  }>;
};

function toSurveySchema(survey: SurveyLike | null): SurveySchema | null {
  if (!survey) return null;
  return {
    category: survey.name,
    entryQuestionKey: survey.entryQuestionKey ?? null,
    questions: survey.questions.map((q) => ({
      id: q.id,
      key: q.key ?? q.id,
      prompt: q.prompt,
      type: q.type,
      scaleMin: q.scaleMin ?? undefined,
      scaleMax: q.scaleMax ?? undefined,
      defaultNextQuestionKey: q.defaultNextQuestionKey ?? null,
      options: q.options?.map((o) => ({
        id: o.id,
        value: o.value,
        label: o.label,
        nextQuestionKey: o.nextQuestionKey ?? null,
        isTerminal: o.isTerminal ?? false,
      })),
    })),
  };
}

/**
 * P2P texting session — the volunteer's press-send cockpit. First it works the claimed
 * INITIAL sends one at a time (the scripted message is read-only; the volunteer's tap is
 * the send — true P2P), then it flows into the claimed REPLY conversations: script assist,
 * canned replies, disposition first, then the bifurcating survey — the SAME field runtime
 * as the door (ScriptAssistPanel / SurveyRunner / CannedResponsePicker). Phone-first,
 * two-pane on desktop.
 */
export function TextSession() {
  const router = useRouter();
  const params = useSearchParams();
  const blastId = params.get("blastId") || "";
  const { showToast } = useToast();

  const { data: queue, loading, error, refetch } = useTextingQueue(blastId || null);
  const { data: flow } = useTextingFlow(blastId || null);

  // The initial-send queue is worked front-to-front: send/skip removes item 0 server-side
  // (status flips) and the 6s poll — or the optimistic local counter — advances the view.
  const [sending, setSending] = useState(false);
  const [sentCount, setSentCount] = useState(0);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const toSend = useMemo(
    () => (queue?.toSend ?? []).filter((r) => !skipped.has(r.recipientId)),
    [queue, skipped],
  );
  const current = toSend[0] ?? null;

  // Reply half — after initial sends are exhausted, work owned conversations.
  const conversations = queue?.conversations ?? [];
  const [activePhone, setActivePhone] = useState<string | null>(null);
  const phone = current ? null : (activePhone ?? conversations[0]?.contactPhone ?? null);
  const { data: thread, refetch: refetchThread } = useTextingThread(phone);
  const [draft, setDraft] = useState("");
  const [replySending, setReplySending] = useState(false);
  const [contactId, setContactId] = useState<string | null>(null);
  const [chosenDisposition, setChosenDisposition] = useState<string | null>(null);
  const [runningSurvey, setRunningSurvey] = useState(false);
  const [logging, setLogging] = useState(false);
  const activePhoneRef = useRef<string | null>(null);

  const surveySchema = useMemo(() => toSurveySchema((flow?.survey as SurveyLike | null) ?? null), [flow]);
  const dispositionOptions = (flow?.dispositions ?? []).filter((d) => d.layer === "CONTACT_RESULT");

  // Resolve the active conversation's contact id for disposition/survey recording. Exact
  // phone match only — never record against a guessed contact.
  const hydrateContact = useCallback(async (p: string) => {
    activePhoneRef.current = p;
    setContactId(null);
    setChosenDisposition(null);
    setRunningSurvey(false);
    setDraft("");
    const found = await searchContacts(p);
    if (activePhoneRef.current !== p) return;
    if (found.ok) {
      const match = found.data.find((c) => c.phoneE164 === p) ?? null;
      setContactId(match?.id ?? null);
    }
  }, []);

  const openConversation = useCallback(
    (p: string) => {
      setActivePhone(p);
      void hydrateContact(p);
    },
    [hydrateContact],
  );

  const pressSend = useCallback(async () => {
    if (!current || sending) return;
    setSending(true);
    const res = await sendTextingInitial(current.recipientId);
    setSending(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Send failed", description: res.error });
      return;
    }
    if (res.data.outcome === "failed") {
      showToast({ tone: "error", title: "Carrier rejected the send", description: res.data.error });
    } else {
      setSentCount((n) => n + 1);
    }
    setSkipped((s) => new Set(s).add(current.recipientId));
    await refetch();
  }, [current, sending, refetch, showToast]);

  const sendReply = useCallback(async () => {
    if (!phone || !draft.trim() || replySending) return;
    setReplySending(true);
    const body = draft;
    setDraft("");
    const res = await sendTextingReply(phone, body);
    setReplySending(false);
    if (!res.ok) {
      setDraft(body);
      showToast({ tone: "error", title: "Send failed", description: res.error });
      return;
    }
    await refetchThread();
  }, [phone, draft, replySending, refetchThread, showToast]);

  const logDisposition = useCallback(
    async (code: string) => {
      if (logging) return;
      if (!contactId) {
        showToast({ tone: "error", title: "Can't log", description: "Couldn't match this number to a contact." });
        return;
      }
      setLogging(true);
      const res = await recordTextingDisposition({ contactId, code, blastId });
      setLogging(false);
      if (!res.ok) {
        showToast({ tone: "error", title: "Couldn't log disposition", description: res.error });
        return;
      }
      setChosenDisposition(code);
      const opensSurvey =
        code.toLowerCase().includes("spoke") && !!surveySchema && surveySchema.questions.length > 0;
      if (opensSurvey) setRunningSurvey(true);
      else showToast({ tone: "success", title: "Logged" });
    },
    [logging, contactId, blastId, surveySchema, showToast],
  );

  const completeSurvey = useCallback(
    async (answers: SurveyAnswer[]) => {
      let failed = false;
      if (contactId) {
        for (const a of answers) {
          const res = await recordTextingSurveyAnswer({
            contactId,
            questionId: a.questionId,
            optionId: a.optionId ?? null,
            valueText: a.valueText ?? null,
            blastId,
          });
          if (!res.ok) failed = true;
        }
      }
      setRunningSurvey(false);
      if (failed || !contactId) {
        showToast({ tone: "error", title: "Survey not fully saved", description: "Some answers didn't save — reopen this contact." });
        return;
      }
      showToast({ tone: "success", title: "Survey + outcome logged" });
    },
    [contactId, blastId, showToast],
  );

  if (!blastId) {
    return <EmptyState title="No text bank" description="Open a session from your text banks." />;
  }
  if (loading && !queue) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }
  if (error) {
    return <EmptyState title="Can't start the session" description={error} />;
  }

  const total = toSend.length + sentCount;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Back"
          onClick={() => router.push("/texts")}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border bg-surface text-foreground"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-extrabold text-foreground">{queue?.title ?? "Texting session"}</h1>
          <p className="text-sm text-muted-foreground tabular-nums">
            {current
              ? `${sentCount} sent · ${toSend.length} to go`
              : `${conversations.length} ${conversations.length === 1 ? "conversation" : "conversations"} to answer`}
          </p>
        </div>
      </div>
      {current ? <ProgressBar value={sentCount} max={total || 1} tone="success" /> : null}

      {current ? (
        /* ── Press-send half: one scripted initial message at a time ─────────── */
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Sending to</p>
          <p className="mt-0.5 text-lg font-bold text-foreground">{current.contactName || current.phone}</p>
          {current.contactName ? <p className="text-sm text-muted-foreground">{current.phone}</p> : null}
          <div className="mt-3 rounded-xl bg-surface-variant p-3 text-sm leading-relaxed text-foreground">
            {current.message}
          </div>
          <div className="mt-4 flex items-center gap-2">
            <Button className="h-12 flex-1 gap-2 text-base" disabled={sending} onClick={() => void pressSend()}>
              {sending ? <Spinner /> : <Send className="h-5 w-5" />}
              Send
            </Button>
            <Button
              variant="ghost"
              className="gap-1.5 text-muted-foreground"
              onClick={() => current && setSkipped((s) => new Set(s).add(current.recipientId))}
            >
              <SkipForward className="h-4 w-4" />
              Skip
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Your tap is the send — each message goes out one at a time, from you.
          </p>
        </div>
      ) : conversations.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={sentCount > 0 ? "All sent — nice work" : "Nothing to work right now"}
          description="Claim more texts or replies from your text banks."
        />
      ) : (
        /* ── Reply half: claimed conversations, two-pane on desktop ──────────── */
        <div className="grid gap-3 xl:grid-cols-[300px_1fr]">
          <div className="space-y-1.5 xl:max-h-[70vh] xl:overflow-y-auto">
            {conversations.map((c) => (
              <button
                key={c.contactPhone}
                type="button"
                onClick={() => openConversation(c.contactPhone)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left",
                  c.contactPhone === phone
                    ? "border-primary bg-primary/10 dark:bg-primary/20"
                    : "border-border bg-surface hover:bg-surface-variant",
                )}
              >
                <span className="min-w-0 truncate text-sm font-semibold text-foreground">
                  {c.contactName || c.contactPhone}
                </span>
                {c.unreadCount > 0 ? <StatusBadge status="ACTION_REQUIRED" label={`${c.unreadCount} new`} /> : null}
              </button>
            ))}
          </div>

          <div className="flex min-h-[50vh] flex-col gap-3 rounded-2xl border border-border bg-surface p-3 shadow-card">
            {flow?.script ? (
              <ScriptAssistPanel name={flow.script.name} steps={flow.script.steps} outcomeKey={chosenDisposition} />
            ) : null}
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-xl border border-border/60 p-3">
              {(thread?.messages ?? []).length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No messages yet.</p>
              ) : (
                (thread?.messages ?? []).map((m) => (
                  <div key={m.id} className={cn("flex", m.type === "outbound" ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[80%] rounded-2xl px-3 py-1.5 text-sm",
                        m.type === "outbound" ? "bg-primary text-white" : "bg-surface-variant text-foreground",
                      )}
                    >
                      {m.body}
                    </div>
                  </div>
                ))
              )}
            </div>

            {runningSurvey && surveySchema ? (
              <SurveyRunner
                schema={surveySchema}
                onComplete={(a) => void completeSurvey(a)}
                onCancel={() => setRunningSurvey(false)}
              />
            ) : (
              <>
                <div className="rounded-xl border border-border p-2.5">
                  <textarea
                    className="min-h-[64px] w-full rounded-lg border border-border bg-background p-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/35"
                    placeholder="Type a reply…"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                        e.preventDefault();
                        void sendReply();
                      }
                    }}
                  />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <CannedResponsePicker
                      responses={(flow?.canned ?? []).map((c) => ({
                        id: c.id,
                        title: c.title,
                        body: c.body,
                        dispositionCode: c.dispositionCode ?? null,
                      }))}
                      onPick={(r) => setDraft((d) => (d.trim() ? `${d.trimEnd()} ${r.body}` : r.body))}
                    />
                    <Button size="sm" className="gap-1.5" disabled={!draft.trim() || replySending} onClick={() => void sendReply()}>
                      <Send className="h-4 w-4" />
                      {replySending ? <Spinner /> : "Send"}
                    </Button>
                  </div>
                </div>
                {dispositionOptions.length > 0 ? (
                  <div>
                    <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">Log the outcome</p>
                    <div className="flex flex-wrap gap-2">
                      {dispositionOptions.map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          disabled={logging}
                          onClick={() => void logDisposition(d.code)}
                          className={cn(
                            "rounded-xl border px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-50",
                            chosenDisposition === d.code
                              ? "border-primary bg-primary/10 text-primary dark:bg-primary/20"
                              : "border-border hover:border-primary/40",
                          )}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
