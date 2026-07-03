"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { SegmentBuilder } from "../_components/segment-builder";
import { emptySegment } from "../_data/mock";

export default function NewSegmentPage() {
  return (
    <div className="page-stack">
      <Link
        href="/future/segmentation"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Back to audiences
      </Link>
      <SegmentBuilder initial={emptySegment()} />
    </div>
  );
}
