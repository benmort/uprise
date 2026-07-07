"use client";

import Link from "next/link";
import { ArrowRight, MessageSquareText, ListChecks, Sparkles, Tag, FileText } from "lucide-react";
import { SectionCard } from "@uprise/field";
import { PageHeader } from "@/components/ui/page-header";

const TOOLS = [
  {
    href: "/content/dispositions",
    label: "Dispositions",
    desc: "The shared outcome taxonomy for doors and texts.",
    icon: Tag,
    ready: true,
  },
  {
    href: "/content/canned-responses",
    label: "Canned responses",
    desc: "Reusable replies that log a disposition when sent.",
    icon: MessageSquareText,
    ready: true,
  },
  {
    href: "/content/surveys",
    label: "Surveys & questions",
    desc: "Author once — renders to a door button and a text reply.",
    icon: ListChecks,
    ready: true,
  },
  {
    href: "/content/scripts",
    label: "Scripts",
    desc: "Opening lines and branches for a conversation.",
    icon: FileText,
    ready: true,
  },
];

export default function EngagementPage() {
  return (
    <div className="page-stack">
      <PageHeader
        title="Content"
        icon={Sparkles}
        description="Shared building blocks for door and text conversations."
      />

      <div id="tour-engagement-grid" className="grid gap-3 md:grid-cols-2">
        {TOOLS.map((t) => {
          const Icon = t.icon;
          const inner = (
            <SectionCard className={t.ready ? "transition hover:border-primary" : "opacity-60"}>
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 dark:bg-primary/20 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-bold text-foreground">
                    {t.label}
                    {!t.ready ? (
                      <span className="rounded-full bg-surface-variant px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                        Soon
                      </span>
                    ) : null}
                  </p>
                  <p className="text-sm text-muted-foreground">{t.desc}</p>
                </div>
                {t.ready ? <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground" /> : null}
              </div>
            </SectionCard>
          );
          return t.ready ? (
            <Link key={t.href} href={t.href}>
              {inner}
            </Link>
          ) : (
            <div key={t.href}>{inner}</div>
          );
        })}
      </div>
    </div>
  );
}
