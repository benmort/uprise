"use client";

import { useState } from "react";
import { Check, ChevronLeft, Circle } from "lucide-react";
import { Button, Input, cn } from "@uprise/ui";

export type SurveyOption = { id: string; value: string; label: string; hint?: string };
export type SurveyQuestion = {
  id: string;
  prompt: string;
  type: "yes_no" | "single_choice" | "multi_choice" | "text" | "scale";
  required?: boolean;
  scaleMin?: number;
  scaleMax?: number;
  options?: SurveyOption[];
};

export type SurveySchema = { questions: SurveyQuestion[]; category?: string };
export type SurveyAnswer = { questionId: string; optionId?: string; valueText?: string };

/**
 * Door survey — one question per screen, big tap targets, fully offline. Choice
 * questions auto-advance on select (one-tap); text needs a confirm. A progress bar
 * tracks position; each question can be skipped. Calls onComplete with the answers.
 */
export function SurveyRunner({
  schema,
  onComplete,
  onCancel,
}: {
  schema: SurveySchema;
  onComplete: (answers: SurveyAnswer[]) => void;
  onCancel?: () => void;
}) {
  const total = schema.questions.length;
  const category = (schema.category ?? "Survey").toUpperCase();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, SurveyAnswer>>({});
  const question = schema.questions[index];

  if (!question) {
    onComplete([]);
    return null;
  }

  const isLast = index === total - 1;
  const current = answers[question.id];
  const finish = (next: Record<string, SurveyAnswer>) =>
    onComplete(schema.questions.map((q) => next[q.id]).filter(Boolean) as SurveyAnswer[]);

  const commit = (a: SurveyAnswer | null) => {
    const next = { ...answers };
    if (a) next[question.id] = a;
    else delete next[question.id];
    setAnswers(next);
    if (isLast) finish(next);
    else setIndex((i) => i + 1);
  };

  const back = () => (index > 0 ? setIndex((i) => i - 1) : onCancel?.());
  const pct = Math.round((index / total) * 100);

  const choiceOptions =
    question.type === "yes_no" ? question.options ?? defaultYesNo(question) : question.options ?? [];

  return (
    <div className="space-y-5">
      {/* Progress — thin bar on the left, right-aligned counter */}
      <div className="flex items-center gap-4">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-variant">
          <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
        <span className="shrink-0 text-sm font-bold tabular-nums text-muted-foreground">
          Question {index + 1} of {total}
        </span>
      </div>

      {/* Question card */}
      <div className="rounded-3xl border border-border bg-surface p-6 shadow-card">
        <p className="text-sm font-bold uppercase tracking-[0.08em] text-primary">
          {category} · Question {index + 1}
        </p>
        <h2 className="mt-2 text-[26px] font-extrabold leading-tight text-foreground">{question.prompt}</h2>

        {question.type === "text" ? (
          <Input
            className="mt-6"
            value={current?.valueText ?? ""}
            onChange={(e) => setAnswers((p) => ({ ...p, [question.id]: { questionId: question.id, valueText: e.target.value } }))}
            placeholder="Type a response"
          />
        ) : question.type === "scale" ? (
          <div className="mt-6 flex flex-wrap gap-2.5">
            {scaleRange(question).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => commit({ questionId: question.id, valueText: String(n) })}
                className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border text-lg font-bold text-foreground transition-colors hover:border-primary/40"
              >
                {n}
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {choiceOptions.map((opt) => {
              const selected = current?.optionId === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => commit({ questionId: question.id, optionId: opt.id })}
                  className={cn(
                    "flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-colors",
                    selected ? "border-primary bg-primary/5" : "border-border bg-surface hover:border-primary/40",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-bold text-foreground">{opt.label}</span>
                    {opt.hint ? (
                      <span className="mt-1 block text-sm leading-snug text-muted-foreground">{opt.hint}</span>
                    ) : null}
                  </span>
                  {selected ? (
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-white">
                      <Check className="h-4 w-4" strokeWidth={3} />
                    </span>
                  ) : (
                    <Circle className="h-6 w-6 shrink-0 text-muted-foreground/40" strokeWidth={1.75} />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer — back chevron + wide skip (or confirm on text questions) */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={back}
          aria-label="Back"
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-border bg-surface text-foreground"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        {question.type === "text" ? (
          <Button className="h-14 flex-1 text-base" onClick={() => commit(current ?? null)}>
            {isLast ? "Done" : "Next"}
          </Button>
        ) : (
          <button
            type="button"
            onClick={() => commit(null)}
            className="h-14 flex-1 rounded-2xl border border-dashed border-border text-base font-bold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            Skip question
          </button>
        )}
      </div>
    </div>
  );
}

function defaultYesNo(q: SurveyQuestion): SurveyOption[] {
  return [
    { id: `${q.id}-yes`, value: "yes", label: "Yes" },
    { id: `${q.id}-no`, value: "no", label: "No" },
  ];
}

function scaleRange(q: SurveyQuestion): number[] {
  const min = q.scaleMin ?? 1;
  const max = q.scaleMax ?? 5;
  const out: number[] = [];
  for (let n = min; n <= max; n += 1) out.push(n);
  return out;
}
