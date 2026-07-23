"use client";

import type { ReactNode } from "react";
import { Spinner } from "@uprise/ui";
import { createPortal } from "react-dom";

/**
 * The branded full-screen loading dialogue — a centred card with a brand mark, a spinning
 * badge, and a title/subtitle. Portalled to <body> so it covers the whole viewport (the
 * top-bar/sidebar live in a transformed container that would otherwise clip a fixed overlay).
 *
 * Shared by the workspace switcher (`SwitchingModal`) and the slow-page-load safety net
 * (`DelayedWorkspaceLoader`) so both wear the exact same dialogue. `mark` defaults to the
 * Uprise icon; pass a tenant avatar for the switch case.
 */
export function WorkspaceLoadingOverlay({
  title,
  subtitle = "Loading your workspace…",
  mark,
}: {
  title: string;
  subtitle?: string;
  mark?: ReactNode;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      role="alertdialog"
      aria-busy="true"
      aria-label={title}
    >
      <div className="flex w-full max-w-xs flex-col items-center gap-4 rounded-2xl border border-border bg-surface p-8 text-center shadow-elevated">
        <div className="relative">
          {mark ?? (
            // eslint-disable-next-line @next/next/no-img-element -- static app icon, no optimisation needed
            <img src="/images/uprise-icon.svg" alt="" aria-hidden className="h-16 w-16" />
          )}
          <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-surface">
            <Spinner className="h-4 w-4 animate-spin text-primary" />
          </span>
        </div>
        <div>
          <p className="text-base font-bold text-foreground">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
