"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getSegmentDefinition, type SegmentDetail } from "@/lib/api";
import { SegmentBuilder } from "@/components/segments/segment-builder";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

export default function EditSegmentPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : "";
  const [segment, setSegment] = useState<SegmentDetail | null>(null);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getSegmentDefinition(id).then((result) => {
      if (cancelled) return;
      if (result.ok) setSegment(result.data);
      else setError({ message: result.error, status: result.status });
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <EmptyState
        title={error.status === 403 ? "No permission" : error.status === 404 ? "Segment not found" : "Couldn't load the segment"}
        description={error.message}
      />
    );
  }
  if (!segment) {
    return (
      <div className="page-stack space-y-4">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }
  return (
    <div className="page-stack">
      <SegmentBuilder segment={segment} />
    </div>
  );
}
