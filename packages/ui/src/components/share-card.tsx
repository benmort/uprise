"use client";

import * as React from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "./button";

/**
 * Share a public URL — a read-only link field with copy + the native share sheet (when available).
 * Self-contained (no card chrome) so callers drop it inside their own SectionCard/panel.
 */
export function ShareCard({
  url,
  title,
  text,
  className,
}: {
  url: string;
  title?: string;
  text?: string;
  className?: string;
}) {
  const [copied, setCopied] = React.useState(false);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the field is selectable as a fallback */
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title, text, url });
    } catch {
      /* user dismissed the share sheet */
    }
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <input
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted-foreground"
        aria-label="Shareable link"
      />
      <Button type="button" variant="outline" size="sm" onClick={copy}>
        {copied ? <Check className="mr-1 h-4 w-4" /> : <Copy className="mr-1 h-4 w-4" />}
        {copied ? "Copied" : "Copy"}
      </Button>
      {canShare ? (
        <Button type="button" variant="ghost" size="sm" onClick={share}>
          <Share2 className="mr-1 h-4 w-4" />
          Share
        </Button>
      ) : null}
    </div>
  );
}
