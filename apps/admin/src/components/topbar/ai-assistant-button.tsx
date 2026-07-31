"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";

/**
 * Topbar AI assistant launcher — sits immediately left of the theme toggle, in the same circular
 * icon-button cluster as the notifications bell and Getting Started rocket (same shell class, same
 * 18px icon; the theme toggle's smaller 16px glyph is the outlier there, because its sun/moon swap
 * rotates and scales).
 *
 * Sparkles rather than Bot deliberately: the assistant page titles itself with Sparkles and uses Bot
 * for the assistant's own message avatar, so Sparkles is the affordance that means "go to the
 * assistant" and Bot is the thing that speaks to you once you arrive.
 *
 * Points at /future/ai/assistant — the canonical route. /future/ai-assistant still exists but is a
 * redirect kept for old bookmarks, so linking it here would cost every click a hop.
 *
 * Visibility is the caller's job, and it matters: this route has NO guard of its own, so it is
 * reachable by anyone who knows the URL and is only kept out of sight by the nav. The layout gates
 * this button on `isSuperAdmin`, matching the nav's own AI entry, so the topbar does not hand every
 * organiser a door into the Future area that the sidebar deliberately hides from them.
 */
export function AiAssistantButton() {
  return (
    <Link
      href="/future/ai/assistant"
      aria-label="AI assistant"
      className="relative flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground transition-colors hover:bg-surface-variant hover:text-foreground"
    >
      <Sparkles className="h-[18px] w-[18px]" />
    </Link>
  );
}
