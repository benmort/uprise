"use client";

import { ShieldOff } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * The four feedback states, rendered DISTINCTLY – before this, pages conflated
 * them (e.g. settings/data showed its empty state for a 500, and most pages
 * had no 403 branch at all). Wire straight off useApi's outputs:
 *
 *   <StateRegion loading={loading} error={error} noPermission={noPermission}
 *                empty={!data?.length} emptyTitle="No files yet">
 *     …content…
 *   </StateRegion>
 */
export function StateRegion({
  loading,
  error,
  noPermission,
  empty,
  emptyTitle = "Nothing here yet",
  emptyDescription,
  errorTitle = "Couldn't load this page",
  onRetry,
  skeleton,
  children,
}: {
  loading?: boolean;
  error?: string | null;
  noPermission?: boolean;
  empty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  errorTitle?: string;
  onRetry?: () => void;
  /** Custom loading markup; default = three skeleton rows. */
  skeleton?: React.ReactNode;
  children: React.ReactNode;
}) {
  if (noPermission) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border p-10 text-center">
        <ShieldOff className="mb-2 h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-semibold text-foreground">You don&rsquo;t have access to this</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Ask an organisation owner if you need this permission.
        </p>
      </div>
    );
  }
  if (loading) {
    return (
      <>
        {skeleton ?? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-2/3" />
          </div>
        )}
      </>
    );
  }
  if (error) {
    return (
      <EmptyState
        title={errorTitle}
        description={error}
        {...(onRetry ? { ctaLabel: "Try again", onCta: onRetry } : {})}
      />
    );
  }
  if (empty) {
    return <EmptyState title={emptyTitle} description={emptyDescription ?? ""} />;
  }
  return <>{children}</>;
}
