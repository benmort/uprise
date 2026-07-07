"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MessageSquare, Plus, Save, Smartphone, Sparkles, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import {
  createSurvey,
  deleteSurvey,
  getSurvey,
  listSurveys,
  updateSurvey,
  type QuestionType,
  type Survey,
  type SurveyQuestion,
} from "@/lib/api/engagement";
import { listDispositions, type DispositionDef } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { FormDialog } from "@/components/ui/form-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionCard } from "@uprise/field";
import { useApi } from "@/lib/use-api";
import { StateRegion } from "@/components/shell/state-region";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const QUESTION_TYPES: Array<{ value: QuestionType; label: string }> = [
  { value: "single_choice", label: "Single choice" },
  { value: "multi_choice", label: "Multiple choice" },
  { value: "yes_no", label: "Yes / No" },
  { value: "text", label: "Free text" },
];

function blankQuestion(): SurveyQuestion {
  return {
    prompt: "New question",
    type: "single_choice",
    options: [{ value: "yes", label: "Yes", cannedReplyText: "Thanks!", dispositionCode: "spoke_to_target" }],
  };
}

/** Validate a survey before save — returns a human message if invalid, else null. */
function validateSurvey(questions: SurveyQuestion[]): string | null {
  if (!questions.length) return "Add at least one question.";
  for (let i = 0; i < questions.length; i += 1) {
    const q = questions[i];
    if (!String(q.prompt ?? "").trim()) return `Question ${i + 1}: enter a prompt.`;
    const needsOptions = q.type === "single_choice" || q.type === "multi_choice";
    if (needsOptions) {
      if (!q.options?.length) return `Question ${i + 1}: add at least one option.`;
      for (let j = 0; j < q.options.length; j += 1) {
        const o = q.options[j];
        if (!String(o.label ?? "").trim() && !String(o.cannedReplyText ?? "").trim()) {
          return `Question ${i + 1}, option ${j + 1}: enter a door label or an SMS reply.`;
        }
      }
    }
  }
  return null;
}

export default function SurveysPage() {
  const { showToast } = useToast();
  const { data, loading, error, noPermission, refetch } = useApi(
    "/surveys",
    () => listSurveys(),
    { ttlMs: 30_000 },
  );
  const list = data ?? [];
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<Survey | null>(null);
  const [busy, setBusy] = useState(false);
  const [dispositions, setDispositions] = useState<DispositionDef[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Auto-select the first survey once the list arrives.
  useEffect(() => {
    setSelectedId((cur) => cur || data?.[0]?.id || "");
  }, [data]);

  // Dispositions populate the per-option select – a secondary lookup, not a
  // page-blocking state.
  useEffect(() => {
    void listDispositions().then((r) => r.ok && setDispositions(r.data.filter((d) => d.layer === "CONTACT_RESULT")));
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDraft(null);
      return;
    }
    void getSurvey(selectedId).then((r) => r.ok && setDraft(r.data));
  }, [selectedId]);

  const openCreate = () => {
    setNewName("");
    setCreateOpen(true);
  };

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return;
    setCreating(true);
    const res = await createSurvey({ name: newName.trim(), questions: [blankQuestion()] });
    setCreating(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't create", description: res.error });
      return;
    }
    setCreateOpen(false);
    void refetch();
    setSelectedId(res.data.id);
  }, [newName, refetch, showToast]);

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
    const problem = validateSurvey(draft.questions);
    if (problem) {
      showToast({ tone: "error", title: "Can't save survey", description: problem });
      return;
    }
    setBusy(true);
    const res = await updateSurvey(draft.id, { name: draft.name, questions: draft.questions });
    setBusy(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't save", description: res.error });
      return;
    }
    setDraft(res.data);
    void refetch();
    showToast({ tone: "success", title: "Survey saved" });
  }, [draft, refetch, showToast]);

  const handleDelete = useCallback(async () => {
    if (!draft) return;
    setBusy(true);
    const res = await deleteSurvey(draft.id);
    setBusy(false);
    setDeleteOpen(false);
    if (res.ok) {
      setSelectedId("");
      void refetch();
      showToast({ tone: "success", title: "Survey deleted" });
    } else {
      showToast({ tone: "error", title: "Couldn't delete", description: res.error });
    }
  }, [draft, refetch, showToast]);

  return (
    <div className="page-stack">
      <PageHeader
        title="Surveys"
        icon={Sparkles}
        description="Reusable question sets for doors and texts."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Content", href: "/content" },
          { label: "Surveys" },
        ]}
        actions={
          <Button onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" />
            New survey
          </Button>
        }
      />

      <StateRegion
        loading={loading}
        error={error}
        noPermission={noPermission}
        onRetry={() => void refetch()}
        empty={list.length === 0}
        emptyTitle="No surveys yet"
        emptyDescription="Author once – each option becomes a door button and a text reply."
        skeleton={<Skeleton className="h-64 w-full" />}
      >
        <div className="grid gap-4 lg:grid-cols-[200px_1fr]">
          <div className="space-y-2">
            {list.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedId(s.id)}
                className={cn(
                  "w-full rounded-xl border p-3 text-left text-sm transition",
                  s.id === selectedId ? "border-primary bg-primary/10 dark:bg-primary/20" : "border-border bg-surface hover:bg-surface-variant",
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
                    <Button size="sm" variant="ghost" className="text-error" onClick={() => setDeleteOpen(true)}>
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
                        <Select
                          value={q.type}
                          onValueChange={(v) => patchQuestion(qi, { type: v as QuestionType })}
                          className="h-8 w-36"
                        >
                          {QUESTION_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                              {t.label}
                            </SelectItem>
                          ))}
                        </Select>
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
                            <Select
                              value={o.dispositionCode || "__none__"}
                              onValueChange={(v) =>
                                patchOption(qi, oi, { dispositionCode: v === "__none__" ? null : v })
                              }
                              className="h-8"
                            >
                              <SelectItem value="__none__">— none —</SelectItem>
                              {dispositions.map((d) => (
                                <SelectItem key={d.id} value={d.code}>
                                  {d.label}
                                </SelectItem>
                              ))}
                            </Select>
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
                        <span key={i} className="rounded-xl border border-primary bg-primary/10 dark:bg-primary/20 px-3 py-1.5 text-sm font-semibold text-primary">
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
      </StateRegion>

      <FormDialog
        open={createOpen}
        title="New survey"
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
        submitLabel="Create"
        busy={creating}
        submitDisabled={!newName.trim()}
      >
        <Field label="Survey name" htmlFor="survey-name" required>
          <Input
            id="survey-name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Doorstep issue ID"
            autoFocus
          />
        </Field>
      </FormDialog>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete survey"
        description={draft ? `Delete “${draft.name}”? This can't be undone.` : ""}
        confirmLabel="Delete"
        busy={busy}
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}
