"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MessagesSquare, SendHorizontal, SkipForward } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@uprise/ui";
import { useToast } from "@/components/ui/toast";
import { ContactDoorContext } from "@/components/inbox/contact-door-context";
import { getConversation, listConversations, sendInboxReply } from "@/lib/api";
import { searchContacts } from "@/lib/api/contacts";
import { getContentFlow, recordDisposition, recordSurveyAnswer } from "@/lib/api/content";
import {
  CannedResponsePicker,
  ScriptAssistPanel,
  SurveyRunner,
  type SurveyAnswer,
  type SurveySchema,
} from "@uprise/field";
import { cn } from "@/lib/utils";

type QueueStatus = "pending" | "done" | "skipped";
type QueueItem = { phone: string; name: string; status: QueueStatus };

type DispositionLike = { id: string; code: string; label: string; layer: string };
type CannedLike = { id: string; title: string; body: string; dispositionCode?: string | null };
type OptionLike = { id: string; value: string; label: string; cannedReplyText?: string | null; nextQuestionKey?: string | null; isTerminal?: boolean };
type QuestionLike = { id: string; key?: string; prompt: string; type: SurveySchema["questions"][number]["type"]; scaleMin?: number | null; scaleMax?: number | null; defaultNextQuestionKey?: string | null; options?: OptionLike[] };
type SurveyLike = { id: string; name: string; entryQuestionKey?: string | null; questions: QuestionLike[] };
type ScriptLike = { name: string; steps: { bodyText: string; outcomeKey?: string | null; orderIndex?: number | null }[] };
type Flow = { dispositions: DispositionLike[]; canned: CannedLike[]; survey: SurveyLike | null; script: ScriptLike | null };

type ThreadMessage = { id: string; type: "inbound" | "outbound"; at: string; body: string };

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
 * P2P texting session — work a text campaign one contact at a time: read the script
 * talk-track, send with a canned reply, log a disposition first, then run the
 * bifurcating survey. Reuses the SAME field runtime as the door (ScriptAssistPanel,
 * SurveyRunner, CannedResponsePicker) so both channels behave identically.
 */
export default function TextingSessionPage() {
  const params = useSearchParams();
  const blastId = params.get("blastId") || "";
  const { showToast } = useToast();

  const [flow, setFlow] = useState<Flow | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [cursor, setCursor] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [contactId, setContactId] = useState<string | null>(null);
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [logging, setLogging] = useState(false);
  const [chosenDisposition, setChosenDisposition] = useState<string | null>(null);
  const [runningSurvey, setRunningSurvey] = useState(false);
  // The phone currently in the cockpit — guards async appends against a contact switch.
  const activePhoneRef = useRef<string | null>(null);

  const active = queue[cursor] ?? null;
  const surveySchema = useMemo(() => toSurveySchema(flow?.survey ?? null), [flow]);
  const doneCount = queue.filter((q) => q.status !== "pending").length;

  // Load the campaign flow + the queue of contacts to work.
  useEffect(() => {
    if (!blastId) {
      setError("No campaign — open a session from a text campaign.");
      setLoading(false);
      return;
    }
    let alive = true;
    void (async () => {
      const [flowRes, convRes] = await Promise.all([
        getContentFlow("BLAST", blastId),
        listConversations({ blastId }),
      ]);
      if (!alive) return;
      if (!flowRes.ok) {
        setError(flowRes.error);
        setLoading(false);
        return;
      }
      setFlow(flowRes.data as unknown as Flow);
      if (!convRes.ok) {
        setError(convRes.error);
        setLoading(false);
        return;
      }
      const rows = convRes.data as Array<Record<string, unknown>>;
      setQueue(
        rows.map((r) => ({
          phone: String(r.contactPhone),
          name: (r.contactName as string) || String(r.contactPhone),
          status: "pending" as QueueStatus,
        })),
      );
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [blastId]);

  // Hydrate the active contact: resolve its id (for recording) + load the thread.
  useEffect(() => {
    setContactId(null);
    setThread([]);
    setDraft("");
    setChosenDisposition(null);
    setRunningSurvey(false);
    activePhoneRef.current = active?.phone ?? null;
    if (!active) return;
    let alive = true;
    void (async () => {
      const [found, conv] = await Promise.all([
        searchContacts(active.phone),
        getConversation(active.phone, "SMS"),
      ]);
      if (!alive) return;
      // Match the EXACT phone — searchContacts is a fuzzy substring OR-search, so
      // data[0] can be a different person (shared/substring number). Never record
      // against a guessed contact.
      if (found.ok) {
        const match = found.data.find((c) => c.phoneE164 === active.phone) ?? null;
        setContactId(match?.id ?? null);
      }
      if (conv.ok) setThread(((conv.data as Record<string, unknown>).messages as ThreadMessage[]) ?? []);
    })();
    return () => {
      alive = false;
    };
  }, [active]);

  const advance = useCallback(
    (status: QueueStatus) => {
      setQueue((q) => q.map((item, i) => (i === cursor ? { ...item, status } : item)));
      setCursor((c) => Math.min(c + 1, queue.length));
    },
    [cursor, queue.length],
  );

  const send = useCallback(async () => {
    if (!active || !draft.trim() || sending) return;
    setSending(true);
    const body = draft;
    setDraft("");
    const phone = active.phone;
    const res = await sendInboxReply(phone, body, "SMS");
    setSending(false);
    if (!res.ok) {
      setDraft(body);
      showToast({ tone: "error", title: "Send failed", description: res.error });
      return;
    }
    // Only append if the cockpit is still on the same contact (guards a mid-send switch).
    if (activePhoneRef.current === phone) {
      setThread((t) => [...t, { id: `local-${t.length}`, type: "outbound", at: new Date().toISOString(), body }]);
    }
  }, [active, draft, sending, showToast]);

  const logDisposition = useCallback(
    async (code: string) => {
      if (logging) return; // guard a double-tap recording two dispositions + skipping a contact
      if (!contactId) {
        showToast({ tone: "error", title: "Can't log", description: "Couldn't match this number to a contact." });
        return;
      }
      setLogging(true);
      const res = await recordDisposition({ contactId, code, channel: "SMS", blastId });
      setLogging(false);
      if (!res.ok) {
        showToast({ tone: "error", title: "Couldn't log disposition", description: res.error });
        return;
      }
      setChosenDisposition(code);
      // Spoke-to-someone + a survey exists → run it; otherwise this contact is done.
      const opensSurvey = code.toLowerCase().includes("spoke") && !!surveySchema && surveySchema.questions.length > 0;
      if (opensSurvey) setRunningSurvey(true);
      else {
        showToast({ tone: "success", title: "Logged" });
        advance("done");
      }
    },
    [logging, contactId, blastId, surveySchema, advance, showToast],
  );

  const completeSurvey = useCallback(
    async (answers: SurveyAnswer[]) => {
      let failed = false;
      if (contactId) {
        for (const a of answers) {
          const res = await recordSurveyAnswer({
            contactId,
            questionId: a.questionId,
            optionId: a.optionId ?? null,
            valueText: a.valueText ?? null,
            channel: "SMS",
            blastId,
          });
          if (!res.ok) failed = true;
        }
      }
      setRunningSurvey(false);
      if (failed || !contactId) {
        // Don't mark done / advance on a partial write — surface it so the contact is re-worked.
        showToast({ tone: "error", title: "Survey not fully saved", description: "Some answers didn't save — reopen this contact." });
        return;
      }
      showToast({ tone: "success", title: "Survey + outcome logged" });
      advance("done");
    },
    [contactId, blastId, advance, showToast],
  );

  const dispositionOptions = (flow?.dispositions ?? []).filter((d) => d.layer === "CONTACT_RESULT");

  return (
    <div className="page-stack">
      <PageHeader
        title="Texting session"
        icon={MessagesSquare}
        description="Work the list one contact at a time — script-assisted, disposition first."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "SMS inbox", href: "/future/sms-inbox" },
          { label: "Session" },
        ]}
      />

      {loading ? (
        <Skeleton className="h-96 w-full" />
      ) : error ? (
        <EmptyState title="Can't start the session" description={error} />
      ) : queue.length === 0 ? (
        <EmptyState title="Nobody to text yet" description="This campaign has no conversations to work through." />
      ) : cursor >= queue.length ? (
        <EmptyState title="Session complete 🎉" description={`Worked ${doneCount} of ${queue.length} contacts.`} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[300px_1fr]">
          {/* Queue */}
          <Card className="flex h-full flex-col overflow-hidden">
            <CardHeader>
              <CardTitle>
                {doneCount} / {queue.length} done
              </CardTitle>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 space-y-1 overflow-y-auto">
              {queue.map((item, i) => (
                <button
                  key={item.phone}
                  type="button"
                  onClick={() => setCursor(i)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm",
                    i === cursor ? "border-primary bg-primary/10 dark:bg-primary/20" : "border-border hover:bg-surface-variant",
                  )}
                >
                  <span className="min-w-0 truncate font-medium text-foreground">{item.name}</span>
                  {item.status === "done" ? (
                    <StatusBadge status="SENT" />
                  ) : item.status === "skipped" ? (
                    <StatusBadge status="ARCHIVED" />
                  ) : null}
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Cockpit */}
          <Card className="flex h-full flex-col overflow-hidden">
            <CardHeader className="border-b border-border">
              <CardTitle>{active?.name}</CardTitle>
              {active ? <ContactDoorContext phone={active.phone} /> : null}
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col gap-3 pt-4">
              {flow?.script ? (
                <ScriptAssistPanel name={flow.script.name} steps={flow.script.steps} outcomeKey={chosenDisposition} />
              ) : null}

              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-xl border border-border bg-surface p-3">
                {thread.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No messages yet — send the opener.</p>
                ) : (
                  thread.map((m) => (
                    <div key={m.id} className={cn("flex", m.type === "outbound" ? "justify-end" : "justify-start")}>
                      <div
                        className={cn(
                          "max-w-[75%] rounded-2xl px-3 py-1.5 text-sm",
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
                <SurveyRunner schema={surveySchema} onComplete={(a) => void completeSurvey(a)} onCancel={() => setRunningSurvey(false)} />
              ) : (
                <>
                  {/* Composer */}
                  <div className="rounded-xl border border-border p-3">
                    <textarea
                      className="min-h-[70px] w-full rounded-lg border border-input bg-background p-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/35"
                      placeholder="Type a reply…"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                          e.preventDefault();
                          void send();
                        }
                      }}
                    />
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <CannedResponsePicker
                        responses={(flow?.canned ?? []).map((c) => ({ id: c.id, title: c.title, body: c.body, dispositionCode: c.dispositionCode ?? null }))}
                        onPick={(r) => setDraft((d) => (d.trim() ? `${d.trimEnd()} ${r.body}` : r.body))}
                      />
                      <Button size="sm" className="gap-1.5" disabled={!draft.trim() || sending} onClick={() => void send()}>
                        <SendHorizontal className="h-4 w-4" />
                        {sending ? <Spinner /> : "Send"}
                      </Button>
                    </div>
                  </div>

                  {/* Outcome — disposition first */}
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
                            "disabled:opacity-50",
                            "rounded-xl border px-3 py-1.5 text-sm font-semibold transition-colors",
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

                  <Button variant="ghost" className="self-start gap-1.5 text-muted-foreground" onClick={() => advance("skipped")}>
                    <SkipForward className="h-4 w-4" />
                    Skip
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
