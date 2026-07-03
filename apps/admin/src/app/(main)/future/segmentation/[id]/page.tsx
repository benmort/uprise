"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { SegmentBuilder } from "../_components/segment-builder";
import { MOCK_SEGMENTS, emptySegment } from "../_data/mock";

export default function EditSegmentPage() {
  const params = useParams<{ id: string }>();
  const segment = MOCK_SEGMENTS.find((s) => s.id === params.id) ?? emptySegment();

  return (
    <div className="page-stack">
      <Link
        href="/future/segmentation"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Back to audiences
      </Link>
      <SegmentBuilder key={segment.id} initial={segment} />
    </div>
  );
}
