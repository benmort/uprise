import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SectionCard } from "@uprise/field";
import { Skeleton } from "@/components/ui/skeleton";

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
};

/**
 * A domain card for the overview. Degrades independently: shows a skeleton while loading,
 * a muted "couldn't load" line on error, an empty node when there's no data — never throws,
 * so one failed endpoint can't take down the dashboard.
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
}: OverviewModuleCardProps) {
  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2">
          {icon ? <span className="text-muted-foreground">{icon}</span> : null}
          {title}
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
  );
}
