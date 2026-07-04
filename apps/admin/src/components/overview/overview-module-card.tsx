import * as React from "react";
import Link from "next/link";
import { ArrowRight, Lock } from "lucide-react";
import { SectionCard } from "@uprise/field";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type OverviewModuleCardProps = {
  title: string;
  description?: string;
  href: string;
  linkLabel?: string;
  icon?: React.ReactNode;
  loading?: boolean;
  error?: string | null;
  isEmpty?: boolean;
  empty?: React.ReactNode;
  children?: React.ReactNode;
  /** Not included in the tenant's plan — greyed + still navigable (super-admins only). */
  locked?: boolean;
  /** Not visible to this user at all (flag off for a non-super-admin) — renders nothing. */
  hidden?: boolean;
};

/**
 * A domain card for the overview. Degrades independently: shows a skeleton while loading,
 * a muted "couldn't load" line on error, an empty node when there's no data — never throws,
 * so one failed endpoint can't take down the dashboard.
 *
 * Plan gating mirrors the sidebar: `hidden` drops the card entirely (a member on a plan
 * without the feature); `locked` greys + marks it but keeps it navigable (a super-admin
 * viewing that tenant).
 */
export function OverviewModuleCard({
  title,
  description,
  href,
  linkLabel = "View",
  icon,
  loading,
  error,
  isEmpty,
  empty,
  children,
  locked,
  hidden,
}: OverviewModuleCardProps) {
  if (hidden) return null;
  return (
    <div
      className={cn(locked && "opacity-60")}
      title={locked ? "Not in this tenant's plan — visible to you as a super-admin" : undefined}
    >
      <SectionCard
        title={
          <span className="flex items-center gap-2">
            {icon ? <span className="text-muted-foreground">{icon}</span> : null}
            {title}
            {locked ? <Lock className="h-3.5 w-3.5 text-muted-foreground/70" /> : null}
          </span>
        }
        description={description}
        action={
          <Link
            href={href}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            {linkLabel}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        }
      >
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : error ? (
          <p className="text-sm text-muted-foreground">Couldn&apos;t load — {error}</p>
        ) : isEmpty ? (
          <div className="text-sm text-muted-foreground">{empty ?? "Nothing here yet."}</div>
        ) : (
          children
        )}
      </SectionCard>
    </div>
  );
}
