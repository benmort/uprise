"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, MessageSquare, Plus, Save, Smartphone, Trash2 } from "lucide-react";
import {
  createSurvey,
  deleteSurvey,
  getSurvey,
  listSurveys,
  updateSurvey,
  type Survey,
  type SurveyListItem,
  type SurveyQuestion,
} from "@/lib/api/engagement";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/canvass/section-card";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

function blankQuestion(): SurveyQuestion {
  return {
    prompt: "New question",
    type: "single_choice",
    options: [{ value: "yes", label: "Yes", cannedReplyText: "Thanks!", dispositionCode: "spoke_to_target" }],
  };
}

export default function SurveysPage() {
  const { showToast } = useToast();
  const [list, setList] = useState<SurveyListItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<Survey | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadList = useCallback(async () => {
    const res = await listSurveys();
    if (res.ok) {
      setList(res.data);
      setSelectedId((cur) => cur || res.data[0]?.id || "");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) {
      setDraft(null);
      return;
    }
    void getSurvey(selectedId).then((r) => r.ok && setDraft(r.data));
  }, [selectedId]);

  const handleCreate = useCallback(async () => {
    const name = window.prompt("Name this survey");
    if (!name?.trim()) return;
    const res = await createSurvey({ name: name.trim(), questions: [blankQuestion()] });
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't create", description: res.error });
      return;
    }
    await loadList();
    setSelectedId(res.data.id);
  }, [loadList, showToast]);

  const patchQuestion = (qi: number, patch: Partial<SurveyQuestion>) => {
    if (!draft) return;
    setDraft({ ...draft, questions: draft.questions.map((q, i) => (i === qi ? { ...q, ...patch } : q)) });
  };

  const patchOption = (qi: number, oi: number, patch: Record<string, unknown>) => {
    if (!draft) return;
    const q = draft.questions[qi];
    const options = (q.options ?? []).map((o, i) => (i === oi ? { ...o, ...patch } : o));
    patchQuestion(qi, { options });
  };

  const handleSave = useCallback(async () => {
    if (!draft) return;
    setBusy(true);
    const res = await updateSurvey(draft.id, { name: draft.name, questions: draft.questions });
    setBusy(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't save", description: res.error });
      return;
    }
    setDraft(res.data);
    await loadList();
    showToast({ tone: "success", title: "Survey saved" });
  }, [draft, loadList, showToast]);

  const handleDelete = useCallback(async () => {
    if (!draft || !window.confirm(`Delete “${draft.name}”?`)) return;
    const res = await deleteSurvey(draft.id);
    if (res.ok) {
      setSelectedId("");
      await loadList();
    }
  }, [draft, loadList, showToast]);

  if (loading) return <div className="page-stack"><Skeleton className="h-64 w-full" /></div>;

  return (
    <div className="page-stack">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/engagement">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Engagement
          </Link>
        </Button>
        <h1 className="text-2xl font-extrabold">Surveys</h1>
        <Button className="ml-auto" onClick={handleCreate}>
          <Plus className="mr-1.5 h-4 w-4" />
          New survey
        </Button>
      </div>

      {list.length === 0 ? (
        <EmptyState
          title="No surveys yet"
          description="Author once — each option becomes a door button and a text reply."
          ctaLabel="New survey"
          onCta={handleCreate}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[200px_1fr]">
          <div className="space-y-2">
            {list.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedId(s.id)}
                className={cn(
                  "w-full rounded-xl border p-3 text-left text-sm transition",
                  s.id === selectedId ? "border-primary bg-[#eef2fd]" : "border-border bg-white hover:bg-surface-variant",
                )}
              >
                <span className="font-semibold text-foreground">{s.name}</span>
                <span className="block text-xs text-muted-foreground">{s.questionCount} questions</span>
              </button>
            ))}
          </div>

          {draft ? (
            <div className="space-y-4">
              <SectionCard
                title={
                  <Input
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    className="h-8 max-w-xs"
                  />
                }
                action={
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" className="text-error" onClick={handleDelete}>
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Delete
                    </Button>
                    <Button size="sm" onClick={handleSave} disabled={busy}>
                      <Save className="mr-1.5 h-3.5 w-3.5" />
                      Save
                    </Button>
                  </div>
                }
              >
                <div className="space-y-4">
                  {draft.questions.map((q, qi) => (
                    <div key={qi} className="rounded-xl border border-border p-3">
                      <div className="flex items-center gap-2">
                        <Input
                          value={q.prompt}
                          onChange={(e) => patchQuestion(qi, { prompt: e.target.value })}
                          className="h-8 flex-1 font-semibold"
                        />
                        <button
                          type="button"
                          aria-label="Remove question"
                          onClick={() =>
                            setDraft({ ...draft, questions: draft.questions.filter((_, i) => i !== qi) })
                          }
                          className="text-muted-foreground hover:text-error"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* Dual-channel options table */}
                      <div className="mt-2 space-y-1.5">
                        <div className="grid grid-cols-[1fr_1fr_120px] gap-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                          <span>Door label</span>
                          <span>SMS reply</span>
                          <span>Disposition</span>
                        </div>
                        {(q.options ?? []).map((o, oi) => (
                          <div key={oi} className="grid grid-cols-[1fr_1fr_120px] gap-2">
                            <Input
                              value={o.label}
                              onChange={(e) => patchOption(qi, oi, { label: e.target.value })}
                              className="h-8"
                            />
                            <Input
                              value={o.cannedReplyText ?? ""}
                              onChange={(e) => patchOption(qi, oi, { cannedReplyText: e.target.value })}
                              className="h-8"
                            />
                            <Input
                              value={o.dispositionCode ?? ""}
                              onChange={(e) => patchOption(qi, oi, { dispositionCode: e.target.value })}
                              className="h-8"
                            />
                          </div>
                        ))}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            patchQuestion(qi, {
                              options: [
                                ...(q.options ?? []),
                                { value: `opt${(q.options ?? []).length + 1}`, label: "Option" },
                              ],
                            })
                          }
                        >
                          <Plus className="mr-1 h-3.5 w-3.5" />
                          Add option
                        </Button>
                      </div>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    onClick={() => setDraft({ ...draft, questions: [...draft.questions, blankQuestion()] })}
                  >
                    <Plus className="mr-1.5 h-4 w-4" />
                    Add question
                  </Button>
                </div>
              </SectionCard>

              {/* Live dual preview */}
              {draft.questions[0] ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <SectionCard title={<span className="flex items-center gap-1.5"><Smartphone className="h-3.5 w-3.5" />At the door</span>}>
                    <p className="mb-2 text-sm font-semibold text-foreground">{draft.questions[0].prompt}</p>
                    <div className="flex flex-wrap gap-2">
                      {(draft.questions[0].options ?? []).map((o, i) => (
                        <span key={i} className="rounded-xl border border-primary bg-[#eef2fd] px-3 py-1.5 text-sm font-semibold text-primary">
                          {o.label}
                        </span>
                      ))}
                    </div>
                  </SectionCard>
                  <SectionCard title={<span className="flex items-center gap-1.5"><MessageSquare className="h-3.5 w-3.5" />As a text reply</span>}>
                    <div className="space-y-2">
                      {(draft.questions[0].options ?? []).map((o, i) => (
                        <div key={i}>
                          <div className="ml-auto w-fit max-w-[80%] rounded-2xl bg-primary px-3 py-1.5 text-sm text-white">
                            {o.cannedReplyText || o.label}
                          </div>
                          {o.dispositionCode ? (
                            <p className="mt-0.5 text-right text-[11px] text-muted-foreground">
                              logs {o.dispositionCode.replaceAll("_", " ")}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </SectionCard>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
