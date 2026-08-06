import { Metadata } from "next";
import { Clock, MessageCircle } from "lucide-react";

export const metadata: Metadata = {
  title: "Social | Admin",
  description: "Social channels — on the roadmap, not yet available",
};

/**
 * Social channels: a roadmap state, deliberately.
 *
 * This page previously rendered a hardcoded mock — "Twitter: Connected", Connect buttons wired to
 * nothing, a "Create Post" scheduler — while nothing in the platform models a social conversation.
 * MessageChannel is SMS | WHATSAPP | VOICE, and the schema carries no comment or DM models at all;
 * the only facebook/twitter/instagram fields anywhere are profile URLs on org and politician records.
 *
 * So the page asserted a capability that does not exist, to anyone who clicked it — which in a demo
 * is precisely when someone clicks an unfamiliar nav item. The public roadmap already lists social
 * DMs as in development and not yet available. This page now says the same thing, in the same words.
 */
const PLANNED = [
  {
    name: "Social DMs in the unified inbox",
    description:
      "Reply to Facebook, Instagram and X direct messages in the same claimable inbox as SMS and WhatsApp, against the same contact record.",
  },
  {
    name: "Comment monitoring",
    description:
      "Surface comments on the campaign's posts alongside DMs, so a question asked in public gets the same follow-up as one asked in private.",
  },
  {
    name: "One supporter history",
    description:
      "A social conversation writes back to the same record as a door knock or a text, rather than living in a separate tab someone has to reconcile later.",
  },
];

/**
 * Deliberately a SERVER component with no client imports.
 *
 * PageShell is `"use client"` and re-exports the @uprise/ui barrel; pulling it into a server
 * component drags that whole client graph into the server build and static generation for this
 * route times out (three attempts, then the build fails). Every other PageShell consumer is itself
 * a client page, so it never surfaces there. This page is inert copy — it needs no client runtime,
 * so it hand-rolls the same header rather than paying for one.
 */
export default function SocialChannelPage() {
  return (
    <div className="page-stack">
      <div className="flex flex-wrap items-center gap-2">
        <MessageCircle className="h-6 w-6 shrink-0 text-primary" />
        <h1 className="text-2xl font-extrabold">Social</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Social channels are in development and not available yet.
      </p>
      <div className="rounded-xl border border-warning-foreground/30 bg-warning-container px-5 py-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-warning-foreground">
          <Clock className="h-4 w-4 shrink-0" />
          On the roadmap – not yet available
        </p>
        <p className="mt-1.5 max-w-2xl text-sm text-warning-foreground">
          Nothing on this page is connected to an account. SMS, WhatsApp and voice are live today and
          already share one inbox; social is designed to join them there rather than sit beside them.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PLANNED.map((item) => (
          <div key={item.name} className="rounded-xl border border-border bg-surface p-5 shadow-card">
            <p className="text-sm font-semibold text-foreground">{item.name}</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
