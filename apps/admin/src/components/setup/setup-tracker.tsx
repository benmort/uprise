"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckCircle2, ChevronUp, X } from "lucide-react";
import { StepProgress } from "@uprise/ui";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FLOW_META } from "@/lib/setup/step-registry";
import {
  attentionKeys,
  flowProgress,
  flowsOf,
  overallProgress,
  setupComplete,
  shouldResurface,
  type DismissSnapshot,
} from "@/lib/setup/setup-state";
import { SetupStepRow } from "./setup-step-row";
import { useSetupState } from "./use-setup-state";

const dismissKey = (tenantId: string) => `uprise.setup.dismissed.${tenantId}`;
const celebrateKey = (tenantId: string) => `uprise.setup.celebrated.${tenantId}`;

function readDismiss(tenantId: string): DismissSnapshot | null {
  try {
    const raw = window.localStorage.getItem(dismissKey(tenantId));
    return raw ? (JSON.parse(raw) as DismissSnapshot) : null;
  } catch {
    return null;
  }
}

/**
 * The floating setup tracker — a bottom-left pill (progress ring + count) expanding to a
 * per-flow checklist popover. Personal chrome: dismissal is per-user localStorage and
 * resurfaces only when a step newly needs attention (e.g. a compliance rejection); a
 * one-time celebration fires when setup completes, then the tracker retires itself.
 * z-40 keeps it under the call bar, nav flyout and the product tour.
 */
export function SetupTracker() {
  const pathname = usePathname();
  const { state, session, tenantId, loading, error, noPermission } = useSetupState();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(true); // pessimistic until localStorage is read
  const [celebrated, setCelebrated] = useState(true);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const pillRef = useRef<HTMLButtonElement | null>(null);

  const complete = state ? setupComplete(state) : false;

  // Resolve dismissal/celebration from localStorage once state + tenant are known.
  useEffect(() => {
    if (!tenantId || !state) return;
    setCelebrated(Boolean(window.localStorage.getItem(celebrateKey(tenantId))));
    setDismissed(!shouldResurface(readDismiss(tenantId), state));
  }, [tenantId, state]);

  // Esc / outside-click collapse (non-modal; focus returns to the pill).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        pillRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const dismiss = useCallback(() => {
    if (!tenantId || !state) return;
    const snap: DismissSnapshot = { at: new Date().toISOString(), attention: attentionKeys(state) };
    window.localStorage.setItem(dismissKey(tenantId), JSON.stringify(snap));
    setDismissed(true);
    setOpen(false);
  }, [tenantId, state]);

  const celebrateDone = useCallback(() => {
    if (!tenantId) return;
    window.localStorage.setItem(celebrateKey(tenantId), new Date().toISOString());
    setCelebrated(true);
  }, [tenantId]);

  const progress = useMemo(() => (state ? overallProgress(state) : { done: 0, total: 0 }), [state]);

  // Hidden: while resolving, on error/no-permission, for volunteers/members, on the setup
  // page itself, when dismissed, or when complete and already celebrated.
  const role = session?.role;
  const eligible = role === "OWNER" || role === "ORGANISER" || session?.isSuperAdmin === true;
  if (loading || error || noPermission || !state || !tenantId || !eligible) return null;
  if (pathname?.startsWith("/getting-started")) return null;
  if (complete && celebrated) return null;
  if (!complete && dismissed) return null;

  // ── Celebration (one-time) ────────────────────────────────────────────────
  if (complete) {
    return (
      <div
        role="dialog"
        aria-label="Setup complete"
        className="fixed bottom-4 left-4 z-40 w-80 rounded-2xl border border-border bg-surface p-6 text-center shadow-theme-lg animate-fade-up lg:left-[calc(var(--sidebar-w,0px)+1rem)]"
      >
        <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
        <p className="mt-3 text-sm font-bold text-foreground">You&apos;re all set — nice work.</p>
        <p className="mt-1 text-xs text-muted-foreground">Everything&apos;s verified and your channels are live.</p>
        <Button size="sm" className="mt-4 w-full" onClick={celebrateDone}>
          Done
        </Button>
      </div>
    );
  }

  // ── Expanded checklist popover ────────────────────────────────────────────
  if (open) {
    const flows = flowsOf(state);
    return (
      <div
        ref={panelRef}
        id="setup-tracker-panel"
        role="dialog"
        aria-label="Workspace setup"
        className="fixed bottom-4 left-4 z-40 max-h-[70vh] w-80 overflow-y-auto rounded-2xl border border-border bg-surface shadow-theme-lg animate-fade-up lg:left-[calc(var(--sidebar-w,0px)+1rem)]"
      >
        <div className="border-b border-border/60 px-4 pb-3 pt-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-bold text-foreground">Finish setting up</p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={dismiss}
                className="rounded-md px-2 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                Dismiss
              </button>
              <button
                type="button"
                aria-label="Collapse"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2.5">
            <StepProgress current={progress.done} total={progress.total} className="flex-1" />
            <span className="text-xs font-semibold text-muted-foreground tabular-nums">
              {progress.done}/{progress.total}
            </span>
          </div>
        </div>
        <div className="px-2 py-2">
          {flows.map((f) => {
            const p = flowProgress(f.steps);
            return (
              <div key={f.key} className="pb-1.5">
                <div className="flex items-center justify-between px-2.5 pb-0.5 pt-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
                    {FLOW_META[f.key].label}
                  </span>
                  <span className="text-[11px] font-semibold text-muted-foreground tabular-nums">
                    {p.done}/{p.total}
                  </span>
                </div>
                {f.steps.map((s) => (
                  <SetupStepRow key={s.key} step={s} compact />
                ))}
              </div>
            );
          })}
        </div>
        <div className="border-t border-border/60 p-3">
          <Button asChild size="sm" className="w-full" onClick={() => setOpen(false)}>
            <Link href="/getting-started">Open setup page</Link>
          </Button>
        </div>
      </div>
    );
  }

  // ── Collapsed pill ────────────────────────────────────────────────────────
  const pct = progress.total > 0 ? progress.done / progress.total : 0;
  const CIRC = 2 * Math.PI * 9;
  return (
    <button
      ref={pillRef}
      type="button"
      aria-expanded={false}
      aria-controls="setup-tracker-panel"
      onClick={() => setOpen(true)}
      className={cn(
        "fixed bottom-4 left-4 z-40 flex items-center gap-2 rounded-full border border-border bg-surface py-1.5 pl-2 pr-3.5",
        "text-sm font-semibold text-foreground shadow-theme-lg transition-colors hover:bg-surface-variant",
        "animate-fade-up lg:left-[calc(var(--sidebar-w,0px)+1rem)]",
      )}
    >
      <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="12" r="9" fill="none" className="stroke-border" strokeWidth="3" />
        <circle
          cx="12"
          cy="12"
          r="9"
          fill="none"
          className="stroke-primary"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={CIRC * (1 - pct)}
          transform="rotate(-90 12 12)"
        />
      </svg>
      Set up
      <span className="text-muted-foreground tabular-nums">
        · {progress.done}/{progress.total}
      </span>
      <ChevronUp className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}
