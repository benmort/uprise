"use client";

import Link from "next/link";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AudienceList } from "./_components/audience-list";

export default function SegmentationPage() {
  return (
    <div className="page-stack">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Audiences</h1>
          <p className="text-sm text-muted-foreground">
            Reusable audience segments — the intent is evaluated live at every send.
          </p>
        </div>
        <Button asChild>
          <Link href="/future/segmentation/new">
            <Plus className="mr-1.5 h-4 w-4" /> New segment
          </Link>
        </Button>
      </div>

      <AudienceList />
    </div>
  );
}
