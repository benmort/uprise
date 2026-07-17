"use client";

import { useState } from "react";
import { AlertTriangle, Check, Loader2, Plus, Trash2, Wand2 } from "lucide-react";
import type { SegmentCustomClause } from "@uprise/segmentation";
import { compileSegmentCustomQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/** A residual-intent candidate awaiting compilation into a contained SQL clause. */
export interface ClauseCandidate {
  label: string;
  intent: string;
  status?: "idle" | "compiling" | "ok" | "needs-review" | "unsupported";
  reasons?: string[];
  predicate?: string | null;
  count?: number | null;
}

let clauseCounter = 0;
const nextClauseId = () => `cq_${Date.now().toString(36)}_${(clauseCounter += 1)}`;

/**
 * The AI custom-query lane — intent the closed vocabulary can't express gets
 * compiled (Claude → AST-validated predicate over safe fields → live count)
 * and, when OK, attached to the definition as a custom clause + a
 * `custom.clause` leaf in the tree.
 */
export function CustomQueryLane({
  candidates,
  clauses,
  onCandidatesChange,
  onAttach,
  onDetach,
}: {
  candidates: ClauseCandidate[];
  clauses: SegmentCustomClause[];
  onCandidatesChange: (candidates: ClauseCandidate[]) => void;
  onAttach: (clause: SegmentCustomClause) => void;
  onDetach: (clauseId: string) => void;
}) {
  const [draft, setDraft] = useState("");

  const patch = (index: number, changes: Partial<ClauseCandidate>) =>
    onCandidatesChange(candidates.map((c, i) => (i === index ? { ...c, ...changes } : c)));

  const compile = async (index: number) => {
    const candidate = candidates[index];
    patch(index, { status: "compiling" });
    const result = await compileSegmentCustomQuery(candidate.intent);
    if (!result.ok) {
      patch(index, { status: "needs-review", reasons: [result.error] });
      return;
    }
    patch(index, {
      status: result.data.status,
      reasons: result.data.reasons,
      predicate: result.data.predicate,
      count: result.data.count,
    });
  };

  const attach = (index: number) => {
    const candidate = candidates[index];
    if (candidate.status !== "ok" || !candidate.predicate) return;
    onAttach({
      id: nextClauseId(),
      label: candidate.label.slice(0, 200),
      intent: candidate.intent.slice(0, 2000),
      predicate: candidate.predicate,
    });
    onCandidatesChange(candidates.filter((_, i) => i !== index));
  };

  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-border p-4">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
          <Wand2 className="h-3.5 w-3.5" />
        </span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">Custom queries</p>
          <p className="text-xs text-muted-foreground">
            Intent the catalogue can&apos;t express — AI writes a contained, validated query.
          </p>
        </div>
      </div>
      <CardContent className="space-y-3 p-4">
        {clauses.map((clause) => (
          <div
            key={clause.id}
            className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background p-3"
          >
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Check className="h-3.5 w-3.5 text-[hsl(var(--success))]" /> {clause.label}
              </p>
              <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{clause.predicate}</p>
            </div>
            <button
              type="button"
              aria-label="Remove clause"
              className="text-muted-foreground hover:text-error"
              onClick={() => onDetach(clause.id)}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}

        {candidates.map((candidate, index) => (
          <div key={`${candidate.intent}-${index}`} className="rounded-lg border border-dashed border-border p-3">
            <p className="text-sm font-medium text-foreground">{candidate.label}</p>
            <p className="text-xs text-muted-foreground">{candidate.intent}</p>
            {candidate.status === "ok" && (
              <p className="mt-1 font-mono text-xs text-foreground">
                {candidate.predicate} <span className="text-muted-foreground">≈ {candidate.count?.toLocaleString()} match</span>
              </p>
            )}
            {(candidate.status === "needs-review" || candidate.status === "unsupported") && (
              <p className="mt-1 flex items-start gap-1 text-xs text-warning-foreground">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {candidate.reasons?.join("; ") || "Could not compile this intent."}
              </p>
            )}
            <div className="mt-2 flex gap-2">
              {candidate.status === "ok" ? (
                <Button size="sm" onClick={() => attach(index)}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add to definition
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={candidate.status === "compiling"}
                  onClick={() => compile(index)}
                >
                  {candidate.status === "compiling" ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Wand2 className="mr-1 h-3.5 w-3.5" />
                  )}
                  Compile
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onCandidatesChange(candidates.filter((_, i) => i !== index))}
              >
                Dismiss
              </Button>
            </div>
          </div>
        ))}

        <div className="flex gap-2">
          <Input
            value={draft}
            placeholder="Describe a condition in plain English…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && draft.trim()) {
                onCandidatesChange([
                  ...candidates,
                  { label: draft.trim().slice(0, 60), intent: draft.trim(), status: "idle" },
                ]);
                setDraft("");
              }
            }}
          />
          <Button
            variant="outline"
            disabled={!draft.trim()}
            onClick={() => {
              onCandidatesChange([
                ...candidates,
                { label: draft.trim().slice(0, 60), intent: draft.trim(), status: "idle" },
              ]);
              setDraft("");
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
