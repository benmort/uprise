"use client";

import { useState } from "react";
import { DoorOpen, MessageSquare } from "lucide-react";
import type { SurveyQuestion } from "@/lib/api/engagement";
import { SectionCard } from "@uprise/field";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";

type Channel = "DOOR" | "SMS";

/**
 * "Author once → a door button AND a text reply." Renders a survey's questions the
 * way a canvasser or a texter sees them, toggled by channel. Walks every question
 * (not just the first) so an author sees the whole flow. Reused by the survey builder
 * and (later) the SMS console preview.
 */
export function DualChannelPreview({ questions }: { questions: SurveyQuestion[] }) {
  const [channel, setChannel] = useState<Channel>("DOOR");
  const shown = questions.filter((q) => String(q.prompt ?? "").trim());

  return (
    <SectionCard
      title="Preview"
      action={
        <SegmentedControl<Channel>
          value={channel}
          onChange={setChannel}
          size="sm"
          aria-label="Preview channel"
          options={[
            { value: "DOOR", label: "At the door", icon: <DoorOpen className="h-3.5 w-3.5" /> },
            { value: "SMS", label: "As a text", icon: <MessageSquare className="h-3.5 w-3.5" /> },
          ]}
        />
      }
    >
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">Add a question to see the preview.</p>
      ) : (
        <div className="space-y-5">
          {shown.map((q, qi) => (
            <div key={qi} className="space-y-2">
              <p className="text-sm font-semibold text-foreground">{q.prompt}</p>
              {channel === "DOOR" ? (
                <div className="flex flex-wrap gap-2">
                  {(q.options ?? []).map((o, i) => (
                    <span
                      key={i}
                      className="rounded-xl border border-primary bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary dark:bg-primary/20"
                    >
                      {o.label || "—"}
                    </span>
                  ))}
                  {q.type === "text" ? (
                    <span className="rounded-xl border border-dashed border-border px-3 py-1.5 text-sm text-muted-foreground">
                      Free text
                    </span>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-2">
                  {(q.options ?? []).map((o, i) => (
                    <div key={i}>
                      <div className="ml-auto w-fit max-w-[80%] rounded-2xl bg-primary px-3 py-1.5 text-sm text-white">
                        {o.cannedReplyText || o.label || "—"}
                      </div>
                      {o.dispositionCode ? (
                        <p className={cn("mt-0.5 text-right text-[11px] text-muted-foreground")}>
                          logs {o.dispositionCode.replaceAll("_", " ")}
                        </p>
                      ) : null}
                    </div>
                  ))}
                  {q.type === "text" ? (
                    <p className="text-xs text-muted-foreground">Reply captured as free text.</p>
                  ) : null}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
