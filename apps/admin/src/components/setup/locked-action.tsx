"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Circle, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { stepTitle } from "@/lib/setup/step-registry";

/**
 * The locked-until-setup control pattern (permission-gating canon: hide for permission,
 * DISABLE with an affordance for an unmet precondition). Unlocked → children untouched.
 * Locked → a visible Button-lookalike (Lock, aria-disabled) whose click/focus opens a
 * non-modal popover naming the escape hatch: the missing steps + a Finish-setup link, or
 * the plan-upgrade path. The server enforces the same gate — this is advisory UX.
 */
export function LockedAction({
  locked,
  planLocked = false,
  missing = [],
  label,
  setupHref = "/getting-started#organisation",
  className,
  children,
}: {
  locked: boolean;
  /** Renders the plan-upgrade variant instead of the finish-setup one. */
  planLocked?: boolean;
  missing?: Array<{ step: string; field: string }>;
  /** Mirrors the real control's label so the locked state reads identically. */
  label: string;
  setupHref?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (popRef.current?.contains(e.target as Node) || triggerRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!locked) return <>{children}</>;

  const missingSteps = [...new Set(missing.map((m) => m.step))];

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-disabled="true"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setRect(triggerRef.current?.getBoundingClientRect() ?? null);
          setOpen((v) => !v);
        }}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-sm font-medium text-foreground opacity-60",
          className,
        )}
      >
        <Lock className="h-4 w-4" />
        {label}
      </button>

      {open && rect && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={popRef}
              role="dialog"
              aria-label={planLocked ? "Not part of your plan" : "Finish organisation setup first"}
              style={{
                position: "fixed",
                left: Math.min(rect.left, window.innerWidth - 300),
                top: rect.bottom + 8,
              }}
              className="z-50 w-72 rounded-xl border border-border bg-surface p-4 shadow-theme-lg animate-fade-up"
            >
              {planLocked ? (
                <>
                  <p className="text-sm font-bold text-foreground">Not part of your plan</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Dedicated channels are available on Starter and above. You&apos;re sending on shared
                    Uprise channels meanwhile — that keeps working.
                  </p>
                  <a
                    href="mailto:support@uprise.org.au?subject=Upgrading%20our%20plan"
                    className="mt-3 inline-flex text-xs font-bold text-primary"
                  >
                    Talk to us about upgrading →
                  </a>
                </>
              ) : (
                <>
                  <p className="text-sm font-bold text-foreground">Finish organisation setup first</p>
                  <p className="mt-1 text-xs text-muted-foreground">This needs the following completed:</p>
                  <ul className="mt-2 space-y-1.5">
                    {missingSteps.map((step) => (
                      <li key={step} className="flex items-center gap-2 text-xs font-medium text-foreground">
                        <Circle className="h-3 w-3 text-muted-foreground/60" />
                        {stepTitle(step)}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={setupHref}
                    onClick={() => setOpen(false)}
                    className="mt-3 inline-flex text-xs font-bold text-primary"
                  >
                    Finish setup →
                  </Link>
                </>
              )}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
