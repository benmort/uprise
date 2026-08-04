"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Plus, Trash2 } from "lucide-react";
import { autodialer } from "@uprise/api-client";
import type { DialerCampaignWithGraph, DialerGraphIssue } from "@uprise/contracts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, Select, SelectItem, TagChip } from "@uprise/ui";
import { useToast } from "@/components/ui/toast";

/**
 * The survey graph builder — outline + inspector, not a canvas. Left: the
 * ordered questions with their branch chips; right: the selected question's
 * prompt, answers and edges. "Then go to" is [questions… | Outro | Hang up]
 * (nextKey: key | "outro" | null — the locked terminal vocabulary); transfer
 * is an ANSWER TYPE, not a destination. Validation is server-side on save —
 * issues come back as the graph's readable problem list.
 */

type EditableAnswer = {
  digit: string;
  value: string;
  nextKey: string | null;
  type: "SMS" | "SET_LANGUAGE" | "REDIRECT" | "SWITCHBOARD" | null;
  content: string | null;
  transfer: boolean;
  dispositionCode: string | null;
  supportLevel: string | null;
};

type EditableQuestion = {
  key: string;
  name: string;
  audioPrompt: unknown;
  answers: EditableAnswer[];
};

const SUPPORT_LEVELS = [
  "STRONG_SUPPORT",
  "LEAN_SUPPORT",
  "UNDECIDED",
  "LEAN_OPPOSE",
  "STRONG_OPPOSE",
];

function fromCampaign(campaign: DialerCampaignWithGraph): EditableQuestion[] {
  return (campaign.questions ?? []).map((question) => ({
    key: question.key,
    name: question.name,
    audioPrompt: question.audioPrompt ?? null,
    answers: question.answers.map((answer) => ({
      digit: answer.digit,
      value: answer.value,
      nextKey: answer.nextKey,
      type: answer.type,
      content: answer.content,
      transfer: answer.transfer,
      dispositionCode: answer.dispositionCode,
      supportLevel: answer.supportLevel,
    })),
  }));
}

function nextFreeKey(questions: EditableQuestion[]): string {
  let n = questions.length + 1;
  while (questions.some((q) => q.key === `q${n}`)) n += 1;
  return `q${n}`;
}

/** "Then go to" chip label for an answer's edge. */
function edgeLabel(answer: EditableAnswer): string {
  if (answer.type === "REDIRECT" && answer.transfer) return "transfer";
  if (answer.nextKey === "outro") return "outro";
  if (!answer.nextKey) return "hang up";
  return `→ ${answer.nextKey}`;
}

export function SurveyGraphBuilder({
  campaign,
  locked,
  onSaved,
  audioOptions,
}: {
  campaign: DialerCampaignWithGraph;
  locked: boolean;
  onSaved: () => void;
  audioOptions: Array<{ id: string; name: string }>;
}) {
  const { showToast } = useToast();
  const [questions, setQuestions] = useState<EditableQuestion[]>(() => fromCampaign(campaign));
  const [selectedKey, setSelectedKey] = useState<string | null>(questions[0]?.key ?? null);
  const [issues, setIssues] = useState<DialerGraphIssue[]>([]);
  const [saving, setSaving] = useState(false);

  const selected = useMemo(
    () => questions.find((q) => q.key === selectedKey) ?? null,
    [questions, selectedKey],
  );

  const patchQuestion = (key: string, patch: Partial<EditableQuestion>) =>
    setQuestions((all) => all.map((q) => (q.key === key ? { ...q, ...patch } : q)));

  const patchAnswer = (key: string, index: number, patch: Partial<EditableAnswer>) =>
    setQuestions((all) =>
      all.map((q) =>
        q.key === key
          ? { ...q, answers: q.answers.map((a, i) => (i === index ? { ...a, ...patch } : a)) }
          : q,
      ),
    );

  const addQuestion = () => {
    const key = nextFreeKey(questions);
    const question: EditableQuestion = {
      key,
      name: "New question",
      audioPrompt: null,
      answers: [
        { digit: "1", value: "Yes", nextKey: "outro", type: null, content: null, transfer: false, dispositionCode: null, supportLevel: null },
        { digit: "2", value: "No", nextKey: "outro", type: null, content: null, transfer: false, dispositionCode: null, supportLevel: null },
      ],
    };
    setQuestions((all) => [...all, question]);
    setSelectedKey(key);
  };

  const removeQuestion = (key: string) => {
    setQuestions((all) => all.filter((q) => q.key !== key));
    if (selectedKey === key) setSelectedKey(null);
  };

  const addAnswer = (key: string) => {
    const q = questions.find((entry) => entry.key === key);
    if (!q) return;
    const usedDigits = new Set(q.answers.map((a) => a.digit));
    const digit = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].find((d) => !usedDigits.has(d));
    if (!digit) return;
    patchQuestion(key, {
      answers: [
        ...q.answers,
        { digit, value: "Option", nextKey: "outro", type: null, content: null, transfer: false, dispositionCode: null, supportLevel: null },
      ],
    });
  };

  const save = async () => {
    if (saving || locked) return;
    setSaving(true);
    const res = await autodialer.upsertQuestions(campaign.id, {
      questions: questions.map((q) => ({
        key: q.key,
        name: q.name,
        audioPrompt: q.audioPrompt ?? undefined,
        answers: q.answers.map((a) => ({
          digit: a.digit,
          value: a.value,
          nextKey: a.nextKey,
          type: a.type ?? undefined,
          content: a.content ?? undefined,
          transfer: a.transfer || undefined,
          dispositionCode: a.dispositionCode ?? undefined,
          supportLevel: a.supportLevel ?? undefined,
        })),
      })),
    });
    setSaving(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Graph not saved", description: res.error });
      return;
    }
    setIssues(res.data.issues);
    const errors = res.data.issues.filter((issue) => issue.severity === "error");
    showToast({
      tone: errors.length ? "warning" : "success",
      title: errors.length ? "Saved with problems" : "Survey saved",
      description: errors.length ? "Fix the listed problems before activating." : undefined,
    });
    onSaved();
  };

  const audioOf = (prompt: unknown): string =>
    prompt && typeof prompt === "object" && typeof (prompt as { audio?: unknown }).audio === "string"
      ? ((prompt as { audio: string }).audio ?? "")
      : "";

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Survey graph</h3>
          <p className="text-xs text-muted-foreground">
            Callers answer on the keypad; pressing star always opts out. Linear polls need no
            branch work — every answer defaults to the outro.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={addQuestion} disabled={locked}>
          <Plus className="mr-1.5 h-4 w-4" /> Question
        </Button>
      </div>

      {issues.length > 0 ? (
        <ul className="space-y-1 rounded-lg bg-surface-variant p-3 text-xs">
          {issues.map((issue, index) => (
            <li key={index} className={issue.severity === "error" ? "text-error" : "text-muted-foreground"}>
              {issue.questionKey ? `${issue.questionKey}: ` : ""}
              {issue.detail}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[280px,1fr]">
        {/* Outline */}
        <div className="space-y-2">
          {questions.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              No questions yet — add the first one.
            </p>
          ) : null}
          {questions.map((question) => (
            <button
              key={question.key}
              type="button"
              onClick={() => setSelectedKey(question.key)}
              className={`w-full rounded-lg border p-3 text-left transition-colors ${
                selectedKey === question.key ? "border-primary bg-primary/5" : "border-border bg-surface"
              }`}
            >
              <p className="flex items-center gap-2 text-sm font-medium">
                <span className="font-mono text-xs text-muted-foreground">{question.key}</span>
                <span className="truncate">{question.name}</span>
              </p>
              <p className="mt-1 flex flex-wrap gap-1">
                {question.answers.map((answer) => (
                  <TagChip key={answer.digit} label={`${answer.digit} ${edgeLabel(answer)}`} />
                ))}
              </p>
            </button>
          ))}
        </div>

        {/* Inspector */}
        {selected ? (
          <div className="space-y-3 rounded-lg border border-border p-4">
            <div className="flex items-start justify-between gap-2">
              <Field label="Question (spoken)" className="flex-1">
                <Textarea
                  value={selected.name}
                  onChange={(e) => patchQuestion(selected.key, { name: e.target.value })}
                  rows={2}
                  disabled={locked}
                />
              </Field>
              <Button
                size="sm"
                variant="ghost"
                aria-label="Delete question"
                onClick={() => removeQuestion(selected.key)}
                disabled={locked}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            <Field label="Recording" hint="Overrides the spoken text when set.">
              <Select
                value={audioOf(selected.audioPrompt) || "none"}
                onValueChange={(value) =>
                  patchQuestion(selected.key, {
                    audioPrompt:
                      value === "none"
                        ? selected.name
                          ? { name: selected.name }
                          : null
                        : { name: selected.name, audio: value },
                  })
                }
                disabled={locked}
                className="w-full"
              >
                <SelectItem value="none">No recording — speak the text</SelectItem>
                {audioOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name}
                  </SelectItem>
                ))}
              </Select>
            </Field>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Answers</span>
                <Button size="sm" variant="ghost" onClick={() => addAnswer(selected.key)} disabled={locked}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Answer
                </Button>
              </div>
              {selected.answers.map((answer, index) => (
                <div key={index} className="grid grid-cols-[44px,1fr] items-start gap-2 rounded-lg bg-surface-variant p-2">
                  <Input
                    value={answer.digit}
                    onChange={(e) => patchAnswer(selected.key, index, { digit: e.target.value.slice(0, 1) })}
                    className="text-center font-mono"
                    aria-label="Digit"
                    disabled={locked}
                  />
                  <div className="space-y-2">
                    <Input
                      value={answer.value}
                      onChange={(e) => patchAnswer(selected.key, index, { value: e.target.value })}
                      aria-label="Answer label"
                      disabled={locked}
                    />
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden /> Then go to
                        <Select
                          value={
                            answer.type === "REDIRECT" && answer.transfer
                              ? "__transfer"
                              : (answer.nextKey ?? "__hangup")
                          }
                          onValueChange={(value) => {
                            if (value === "__transfer") {
                              patchAnswer(selected.key, index, { type: "REDIRECT", transfer: true, nextKey: null });
                              return;
                            }
                            patchAnswer(selected.key, index, {
                              type: answer.type === "REDIRECT" ? null : answer.type,
                              transfer: false,
                              nextKey: value === "__hangup" ? null : value === "outro" ? "outro" : value,
                            });
                          }}
                          disabled={locked}
                          className="flex-1"
                          aria-label="Then go to"
                        >
                          {questions
                            .filter((q) => q.key !== selected.key)
                            .map((q) => (
                              <SelectItem key={q.key} value={q.key}>
                                {q.key} — {q.name.slice(0, 32)}
                              </SelectItem>
                            ))}
                          <SelectItem value="outro">Outro</SelectItem>
                          <SelectItem value="__hangup">Hang up</SelectItem>
                          <SelectItem value="__transfer">Transfer (patch through)</SelectItem>
                        </Select>
                      </label>
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        Support
                        <Select
                          value={answer.supportLevel ?? "none"}
                          onValueChange={(value) =>
                            patchAnswer(selected.key, index, { supportLevel: value === "none" ? null : value })
                          }
                          disabled={locked}
                          className="flex-1"
                          aria-label="Support level"
                        >
                          <SelectItem value="none">—</SelectItem>
                          {SUPPORT_LEVELS.map((level) => (
                            <SelectItem key={level} value={level}>
                              {level.replace("_", " ").toLowerCase()}
                            </SelectItem>
                          ))}
                        </Select>
                      </label>
                    </div>
                    <Input
                      value={answer.dispositionCode ?? ""}
                      onChange={(e) =>
                        patchAnswer(selected.key, index, { dispositionCode: e.target.value.trim() || null })
                      }
                      placeholder="Disposition code (optional — writes back to the contact)"
                      disabled={locked}
                      className="text-xs"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
            Select a question to edit its prompt, answers and branches.
          </p>
        )}
      </div>

      <div className="flex justify-end">
        <Button onClick={() => void save()} disabled={saving || locked}>
          {saving ? "Saving…" : "Save survey"}
        </Button>
      </div>
    </Card>
  );
}
