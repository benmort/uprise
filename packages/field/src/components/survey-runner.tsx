"use client";

import { useState } from "react";
import { Button } from "@uprise/ui";
import { Input } from "@uprise/ui";

export type SurveyQuestion = {
  id: string;
  prompt: string;
  type: "yes_no" | "single_choice" | "multi_choice" | "text" | "scale";
  required?: boolean;
  scaleMin?: number;
  scaleMax?: number;
  options?: Array<{ id: string; value: string; label: string }>;
};

export type SurveySchema = { questions: SurveyQuestion[] };
export type SurveyAnswer = { questionId: string; optionId?: string; valueText?: string };

/** Renders a survey one question per screen with large tap targets — fully
 *  offline, no network. Calls onComplete with the collected answers. */
export function SurveyRunner({
  schema,
  onComplete,
  onCancel,
}: {
  schema: SurveySchema;
  onComplete: (answers: SurveyAnswer[]) => void;
  onCancel?: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, SurveyAnswer>>({});
  const question = schema.questions[index];
  const isLast = index === schema.questions.length - 1;

  if (!question) {
    onComplete([]);
    return null;
  }

  const setAnswer = (a: SurveyAnswer) => setAnswers((prev) => ({ ...prev, [question.id]: a }));

  const advance = () => {
    if (isLast) {
      onComplete(schema.questions.map((q) => answers[q.id]).filter(Boolean) as SurveyAnswer[]);
    } else {
      setIndex((i) => i + 1);
    }
  };

  const current = answers[question.id];
  const canAdvance = !question.required || Boolean(current?.optionId || current?.valueText);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Question {index + 1} of {schema.questions.length}
        </span>
        {onCancel && (
          <button type="button" className="underline" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      <p className="text-base font-medium">{question.prompt}</p>

      {(question.type === "single_choice" ||
        question.type === "multi_choice" ||
        question.type === "yes_no") && (
        <div className="grid gap-2">
          {(question.options ?? defaultYesNo(question)).map((opt) => (
            <Button
              key={opt.id}
              type="button"
              variant={current?.optionId === opt.id ? "default" : "secondary"}
              className="h-12 justify-start text-base"
              onClick={() => setAnswer({ questionId: question.id, optionId: opt.id })}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      )}

      {question.type === "scale" && (
        <div className="flex flex-wrap gap-2">
          {scaleRange(question).map((n) => (
            <Button
              key={n}
              type="button"
              variant={current?.valueText === String(n) ? "default" : "secondary"}
              className="h-12 w-12 text-base"
              onClick={() => setAnswer({ questionId: question.id, valueText: String(n) })}
            >
              {n}
            </Button>
          ))}
        </div>
      )}

      {question.type === "text" && (
        <Input
          value={current?.valueText ?? ""}
          onChange={(e) => setAnswer({ questionId: question.id, valueText: e.target.value })}
          placeholder="Type a response"
        />
      )}

      <div className="flex justify-end">
        <Button onClick={advance} disabled={!canAdvance}>
          {isLast ? "Done" : "Next"}
        </Button>
      </div>
    </div>
  );
}

function defaultYesNo(q: SurveyQuestion) {
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
