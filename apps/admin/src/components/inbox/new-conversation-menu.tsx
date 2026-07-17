"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { CalendarPlus, Heart, Mail, MessageCircle, MessageSquareText, Phone, X } from "lucide-react";
import { cn } from "@uprise/ui";

export type NewConversationChannel = "email" | "sms" | "whatsapp" | "event" | "social" | "call";

type ChannelCard = {
  key: NewConversationChannel;
  title: string;
  sub: string;
  icon: typeof Mail;
  tint: string;
};

// Channel catalogue. SMS, Call + Event are live (first three in the grid); the rest are
// placeholders shown greyed-out with a "Soon" badge until their composers land, so
// the picker previews the full cross-channel roadmap without dead ends.
const CHANNELS: ChannelCard[] = [
  { key: "sms", title: "New text (SMS)", sub: "Send an SMS broadcast or reply", icon: MessageSquareText, tint: "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300" },
  { key: "call", title: "New call", sub: "Place an outbound voice call", icon: Phone, tint: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300" },
  { key: "event", title: "New event", sub: "Schedule an event supporters can RSVP to", icon: CalendarPlus, tint: "bg-teal-100 text-teal-600 dark:bg-teal-500/15 dark:text-teal-300" },
  { key: "email", title: "New email", sub: "Send from the shared address", icon: Mail, tint: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300" },
  { key: "whatsapp", title: "WhatsApp message", sub: "Reply to a WhatsApp contact", icon: MessageCircle, tint: "bg-green-100 text-green-600 dark:bg-green-500/15 dark:text-green-300" },
  { key: "social", title: "Social message", sub: "DM or reply on socials", icon: Heart, tint: "bg-pink-100 text-pink-600 dark:bg-pink-500/15 dark:text-pink-300" },
];

// SMS, Call + Event have live destinations today; everything else is "Soon" (disabled + greyed).
const isLive = (key: NewConversationChannel) => key === "sms" || key === "call" || key === "event";

/**
 * "Start a new conversation" — the shared-inbox channel picker. A backdrop-blurred
 * modal (portalled to <body> so it dims the whole viewport) that pops in with
 * staggered cards. `onPick` fires only for a live channel; the caller opens the
 * matching composer. Disabled channels are greyed out with a "Soon" badge.
 */
export function NewConversationMenu({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (channel: NewConversationChannel) => void;
}) {
  // Escape closes; lock body scroll while the modal is up.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  // The overlay must cover the whole viewport, so portal to <body> — rendering in
  // place would clip it to the transformed main-content container (its containing
  // block for position:fixed), leaving the sidebar + header undimmed.
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="animate-overlay-in fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Start a new conversation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Bottom sheet on mobile (flush to the bottom edge, scrolls, capped to the
          dynamic viewport so the cards never clip off-screen); centred dialog ≥ sm. */}
      <div className="animate-dialog-pop flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-y-auto rounded-t-3xl border border-border bg-surface p-5 shadow-xl sm:max-h-[85vh] sm:rounded-3xl sm:p-8">
        <div className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-border sm:hidden" aria-hidden />
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-2xl font-extrabold text-foreground">Start a new conversation</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Pick a channel – we&apos;ll open the right composer for you.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-variant text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {CHANNELS.map((c, i) => {
            const live = isLive(c.key);
            const Icon = c.icon;
            return (
              <button
                key={c.key}
                type="button"
                disabled={!live}
                onClick={() => {
                  onPick(c.key);
                  onClose();
                }}
                style={{ animationDelay: `${70 + i * 45}ms` }}
                className={cn(
                  // Compact icon+text row on mobile (fits many in a short sheet); the
                  // taller icon-over-text card ≥ sm.
                  "animate-fade-up group flex flex-row items-center gap-3 rounded-2xl border p-4 text-left transition-colors sm:flex-col sm:items-start sm:gap-0",
                  live
                    ? "border-border hover:border-primary/40 hover:bg-primary/[0.04]"
                    : "cursor-not-allowed border-border/60 bg-surface-variant/30 opacity-70",
                )}
              >
                <span
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                    live ? c.tint : "bg-surface-variant text-muted-foreground",
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 sm:mt-6">
                  <span
                    className={cn(
                      "flex items-center gap-2 font-bold",
                      live ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {c.title}
                    {!live ? (
                      <span className="rounded-full bg-surface-variant px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                        Soon
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-sm text-muted-foreground sm:mt-1">{c.sub}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
