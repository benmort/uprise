"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { DoorOpen, MapPin, MessageSquare, Phone, Send, Workflow } from "lucide-react";
import { getContactProfile, type ContactProfile, type TimelineEntry } from "@/lib/api/contacts";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { TagChip } from "@/components/ui/tag-chip";
import { SupportPill } from "@/components/canvass/support-pill";
import { SectionCard } from "@/components/canvass/section-card";
import { cn } from "@/lib/utils";

type Filter = "all" | "doors" | "texts";

function initials(name: string | null): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function TimelineCard({ e }: { e: TimelineEntry }) {
  if (e.kind === "knock") {
    return (
      <div className="rounded-xl border border-[hsl(var(--knock))]/30 bg-[hsl(var(--knock))]/[0.06] p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-[hsl(var(--knock))]">
            <DoorOpen className="h-3.5 w-3.5" />
            Door knock
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">{when(e.at)}</span>
        </div>
        <p className="mt-1 text-sm text-foreground">
          {e.dispositionCode ? e.dispositionCode.replaceAll("_", " ") : "Logged"}
          {e.volunteer ? ` · ${e.volunteer.name}` : ""}
        </p>
        {e.notes ? <p className="mt-1 text-xs text-muted-foreground">{e.notes}</p> : null}
      </div>
    );
  }
  const inbound = e.kind === "text_in";
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "flex items-center gap-1.5 text-sm font-semibold",
            inbound ? "text-foreground" : "text-primary",
          )}
        >
          {inbound ? <MessageSquare className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
          {inbound ? "Inbound text" : "Outbound text"}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">{when(e.at)}</span>
      </div>
      <p className="mt-1 text-sm text-foreground">{e.body}</p>
    </div>
  );
}

export default function ContactProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [profile, setProfile] = useState<ContactProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getContactProfile(id);
      if (!alive) return;
      if (!res.ok) setError(res.error);
      else setProfile(res.data);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  const timeline = useMemo(() => {
    if (!profile) return [];
    if (filter === "doors") return profile.timeline.filter((e) => e.kind === "knock");
    if (filter === "texts") return profile.timeline.filter((e) => e.kind !== "knock");
    return profile.timeline;
  }, [profile, filter]);

  if (loading) {
    return (
      <div className="page-stack">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (error || !profile) {
    return (
      <div className="page-stack">
        <EmptyState title="Can't load contact" description={error || "Not found."} />
      </div>
    );
  }

  const c = profile.contact;
  const name = c.fullName || "Unknown contact";

  return (
    <div className="page-stack">
      {/* Header */}
      <div className="flex flex-wrap items-start gap-4 rounded-2xl border border-border bg-surface p-5">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 dark:bg-primary/20 text-lg font-extrabold text-primary">
          {initials(c.fullName)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-extrabold">{name}</h1>
            {c.supportLevel ? <SupportPill level={c.supportLevel} /> : null}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {c.address ? (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {c.address}
              </span>
            ) : null}
            {c.phoneE164 ? (
              <span className="flex items-center gap-1 tabular-nums">
                <Phone className="h-3.5 w-3.5" />
                {c.phoneE164}
              </span>
            ) : null}
            <span>{profile.audiences.length} audience{profile.audiences.length === 1 ? "" : "s"}</span>
          </div>
        </div>
      </div>

      {/* Next-action banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-primary/10 dark:bg-primary/20 p-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.05em] text-primary">Next action</p>
          <p className="text-sm font-semibold text-foreground">
            {profile.nextAction?.label ?? "No action queued"}
          </p>
        </div>
        <div className="flex gap-2">
          {c.phoneE164 ? (
            <Button asChild>
              <Link href="/inbox">
                <Send className="mr-1.5 h-4 w-4" />
                Send text
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        {/* Unified timeline */}
        <SectionCard
          title="Timeline"
          action={
            <div className="flex rounded-xl border border-border p-0.5">
              {(["all", "doors", "texts"] as Filter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={cn(
                    "rounded-lg px-3 py-1 text-xs font-semibold capitalize transition",
                    filter === f ? "bg-primary text-white" : "text-foreground",
                  )}
                >
                  {f === "all" ? "Unified" : f}
                </button>
              ))}
            </div>
          }
        >
          {timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <div className="space-y-2">
              {timeline.map((e) => (
                <TimelineCard key={e.id} e={e} />
              ))}
            </div>
          )}
        </SectionCard>

        {/* Right rail */}
        <div className="space-y-4">
          <SectionCard title="Survey answers">
            {profile.surveyResponses.length === 0 ? (
              <p className="text-sm text-muted-foreground">None recorded.</p>
            ) : (
              <ul className="space-y-2">
                {profile.surveyResponses.map((s) => (
                  <li key={s.id} className="text-sm">
                    <p className="text-xs text-muted-foreground">{s.prompt ?? "Question"}</p>
                    <p className="flex items-center gap-1.5 font-medium text-foreground">
                      {s.supportLevel ? <SupportPill level={s.supportLevel} variant="dot" /> : s.optionLabel}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Disposition history">
            {profile.dispositions.length === 0 ? (
              <p className="text-sm text-muted-foreground">None recorded.</p>
            ) : (
              <ul className="space-y-1.5">
                {profile.dispositions.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-1.5 text-foreground">
                      <Workflow className="h-3.5 w-3.5 text-muted-foreground" />
                      {d.code.replaceAll("_", " ")}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">{when(d.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Audiences">
            {profile.audiences.length === 0 ? (
              <p className="text-sm text-muted-foreground">Not in any audience.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {profile.audiences.map((a) => (
                  <TagChip key={a.id} label={a.name} />
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
