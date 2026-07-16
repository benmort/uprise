"use client";

import { useState } from "react";
import { ChevronDown, MessageSquareQuote } from "lucide-react";
import { cn } from "@uprise/ui";
import { branchFor, branchSteps, openerStep, type ScriptStepLike } from "../lib/script-flow";

/**
 * Script-assisted talk-track for canvassers/texters. Shows the opening line big and
 * up-front; once a disposition is chosen it surfaces the matching branch ("if they
 * say X, say this"). Before that, the branches are one tap away for reference. Built
 * to be glanced at on a phone mid-conversation — minimal chrome, large type.
 */
export function ScriptAssistPanel({
  name,
  steps,
  outcomeKey,
}: {
  name?: string;
  steps: ScriptStepLike[];
  outcomeKey?: string | null;
}) {
  const opener = openerStep(steps);
  const branches = branchSteps(steps);
  const activeBranch = branchFor(steps, outcomeKey);
  const [open, setOpen] = useState(false);

  if (!opener && branches.length === 0) return null;

  return (
    <div className="rounded-2xl border border-[hsl(var(--knock)/0.35)] bg-[hsl(var(--knock)/0.06)] p-4">
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.08em] text-[hsl(var(--knock))]">
        <MessageSquareQuote className="h-3.5 w-3.5" />
        {name ? name : "Script"}
      </p>

      {opener ? <p className="mt-2 text-lg font-semibold leading-snug text-foreground">{opener.bodyText}</p> : null}

      {/* Once a disposition is chosen, lead with the matching branch. */}
      {activeBranch ? (
        <div className="mt-3 rounded-xl border border-border bg-surface p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Now say — {String(activeBranch.outcomeKey).replaceAll("_", " ")}
          </p>
          <p className="mt-1 text-base font-medium leading-snug text-foreground">{activeBranch.bodyText}</p>
        </div>
      ) : branches.length > 0 ? (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="mt-3 flex items-center gap-1 text-sm font-semibold text-[hsl(var(--knock))]"
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
            {open ? "Hide" : "Show"} responses ({branches.length})
          </button>
          {open ? (
            <div className="mt-2 space-y-2">
              {branches.map((b, i) => (
                <div key={i} className="rounded-xl border border-border bg-surface p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    {String(b.outcomeKey).replaceAll("_", " ")}
                  </p>
                  <p className="mt-1 text-sm leading-snug text-foreground">{b.bodyText}</p>
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
