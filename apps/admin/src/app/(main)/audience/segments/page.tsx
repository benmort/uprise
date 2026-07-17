"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Archive, ArchiveRestore, Plus, RefreshCw, Split } from "lucide-react";
import {
  archiveSegmentDefinition,
  evaluateSegment,
  listSegmentDefinitions,
  restoreSegmentDefinition,
  type SegmentSummary,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";

/**
 * The segment-definition list — reusable audience queries over the contact
 * spine, evaluated live and targetable from the blast composer (each is backed
 * by a DYNAMIC_SEGMENT container audience).
 */
export default function SegmentsPage() {
  const { showToast } = useToast();
  const router = useRouter();
  const [segments, setSegments] = useState<SegmentSummary[] | null>(null);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);

  const load = async () => {
    const result = await listSegmentDefinitions();
    if (result.ok) {
      setSegments(result.data);
      setError(null);
    } else {
      setError({ message: result.error, status: result.status });
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const act = async (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) => {
    const result = await fn();
    if (result.ok) {
      showToast({ tone: "success", title: done });
      void load();
    } else {
      showToast({ tone: "error", title: "Action failed", description: result.error });
    }
  };

  if (error) {
    return (
      <EmptyState
        title={error.status === 403 ? "No permission" : "Couldn't load segments"}
        description={error.status === 403 ? "You need audience access to view segments." : error.message}
      />
    );
  }

  return (
    <div className="page-stack">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Segments</h1>
          <p className="text-sm text-muted-foreground">
            Reusable audience definitions — evaluated live, targetable from any blast.
          </p>
        </div>
        <Button asChild>
          <Link href="/audience/segments/new">
            <Plus className="mr-1.5 h-4 w-4" /> New segment
          </Link>
        </Button>
      </div>

      {segments == null ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      ) : segments.length === 0 ? (
        <EmptyState
          title="No segments yet"
          description="Define who you want to reach — by location, tags, activity or plain English — and target them from any blast."
          ctaLabel="Build your first segment"
          onCta={() => router.push("/audience/segments/new")}
        />
      ) : (
        <div className="grid gap-3">
          {segments.map((segment) => (
            <Card key={segment.id}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/audience/segments/${segment.id}`}
                      className="truncate text-base font-semibold text-foreground hover:underline"
                    >
                      {segment.name}
                    </Link>
                    {segment.archived && <StatusBadge status="ARCHIVED" />}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                    {segment.summary || "No conditions — matches everyone."}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {segment.lastEvaluatedAt
                      ? `Evaluated ${new Date(segment.lastEvaluatedAt).toLocaleString()}`
                      : "Not evaluated yet"}
                    {" · "}v{segment.version}
                    {segment.customClauseCount > 0 && ` · ${segment.customClauseCount} custom quer${segment.customClauseCount === 1 ? "y" : "ies"}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <div className="text-right">
                    <p className="font-mono text-2xl font-bold text-primary">
                      {segment.memberCount.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">members</p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Re-evaluate"
                      onClick={() => act(() => evaluateSegment(segment.id), "Evaluation queued")}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                    {segment.archived ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Restore"
                        onClick={() => act(() => restoreSegmentDefinition(segment.id), "Segment restored")}
                      >
                        <ArchiveRestore className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Archive"
                        onClick={() => act(() => archiveSegmentDefinition(segment.id), "Segment archived")}
                      >
                        <Archive className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
