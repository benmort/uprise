"use client";

import type { ReactNode } from "react";
import { ExternalLink, Monitor, PersonStanding, Smartphone } from "lucide-react";
import { cn } from "@uprise/ui";
import { useLocalStorage } from "@uprise/field";

/**
 * Standalone-demo chrome — the same presentation as the admin "Yarns Canvass" page
 * (apps/admin/src/components/app-embed/field-app-frame.tsx): a titled header with a
 * Phone/Full width toggle and an "Open app" link, the content in a phone-sized frame
 * by default. Here there is no iframe — the demo IS the field app — so "Phone" is a
 * phone-shaped scroll container rather than an embedded document.
 *
 * Embedded (`?embed=1`, the marketing homepage's phone frame) it renders nothing of
 * this: that page already provides the device chrome, so the children pass through
 * untouched. The width choice is remembered per browser and shared by the walk view
 * and the door screen, so knocking a door doesn't pop the phone open to full width.
 */
export function DemoChrome({ embedded, children }: { embedded: boolean; children: ReactNode }) {
  const [width, setWidth] = useLocalStorage<"phone" | "full">("uprise.demoWidth", "phone");

  if (embedded) return <>{children}</>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <PersonStanding className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-extrabold text-foreground">Yarns Canvass</h1>
            <p className="text-sm text-muted-foreground">
              The volunteer canvassing app, live — exactly what a canvasser sees, running on demo
              data.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-surface-variant p-1">
            {(
              [
                { key: "phone", label: "Phone", Icon: Smartphone },
                { key: "full", label: "Full", Icon: Monitor },
              ] as const
            ).map(({ key, label, Icon }) => (
              <button
                key={key}
                type="button"
                aria-pressed={width === key}
                onClick={() => setWidth(key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold",
                  width === key ? "bg-surface text-foreground shadow-card" : "text-muted-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
          <a
            href="/"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-surface-variant"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open app
          </a>
        </div>
      </div>
      <div className="flex justify-center">
        <div
          className={cn(
            width === "phone"
              ? "h-[calc(100dvh-10rem)] w-[430px] max-w-full overflow-y-auto rounded-2xl border border-border bg-surface p-4 shadow-card"
              : "w-full",
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
