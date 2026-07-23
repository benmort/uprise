"use client";

import { useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { ExternalLink, Monitor, Smartphone } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";

/**
 * The embedded volunteer app ("Yarns") — the REAL field app in an iframe. Both apps sit on
 * the same parent domain, so the httpOnly session cookie flows into the frame and SSO just
 * works: what you see is exactly what a volunteer sees, branding and all. A width toggle
 * flips between a phone-sized frame (the app's native shape) and full width (the texting
 * screens' desktop two-pane).
 */
export function FieldAppFrame({
  title,
  description,
  icon,
  path,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  /** Path within the field app, e.g. "/" (My turf) or "/texts". */
  path: string;
}) {
  const [width, setWidth] = useState<"phone" | "full">("phone");
  const src = useMemo(() => {
    const base =
      process.env.NEXT_PUBLIC_FIELD_APP_URL ||
      (typeof window !== "undefined"
        ? `${window.location.protocol}//${window.location.hostname.replace(/^admin\./, "field.")}`
        : "");
    return `${base.replace(/\/$/, "")}${path}`;
  }, [path]);

  return (
    <div className="flex h-[calc(100dvh-7rem)] flex-col gap-4">
      <PageHeader
        title={title}
        icon={icon}
        description={description}
        actions={
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
              href={src}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-surface-variant"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open app
            </a>
          </div>
        }
      />
      <div className="flex min-h-0 flex-1 justify-center">
        <iframe
          src={src}
          title={title}
          className={cn(
            "h-full rounded-2xl border border-border bg-surface shadow-card",
            width === "phone" ? "w-[430px] max-w-full" : "w-full",
          )}
        />
      </div>
    </div>
  );
}
