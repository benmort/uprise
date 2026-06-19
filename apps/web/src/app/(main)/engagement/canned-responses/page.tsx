"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, Zap } from "lucide-react";
import {
  createCannedResponse,
  deleteCannedResponse,
  listCannedResponses,
  type CannedResponseItem,
  type CannedVisibility,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionCard } from "@/components/canvass/section-card";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const COLUMNS: Array<{ key: CannedVisibility; title: string; note: string; tint?: string }> = [
  { key: "ORG", title: "Recommended", note: "Org-wide replies." },
  { key: "PERSONAL", title: "Mine", note: "Your personal replies." },
  {
    key: "AUTO_SEND",
    title: "Auto-send",
    note: "Fires automatically on first reply.",
    tint: "border-warning/40 bg-warning-container/40",
  },
];

export default function CannedResponsesPage() {
  const { showToast } = useToast();
  const [items, setItems] = useState<CannedResponseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<CannedVisibility>("ORG");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await listCannedResponses("SMS");
    if (res.ok) setItems(res.data as unknown as CannedResponseItem[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = useCallback(async () => {
    if (!title.trim() || !body.trim()) return;
    setBusy(true);
    const res = await createCannedResponse({ title: title.trim(), body: body.trim(), visibility });
    setBusy(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't add", description: res.error });
      return;
    }
    setTitle("");
    setBody("");
    await load();
    showToast({ tone: "success", title: "Canned response added" });
  }, [title, body, visibility, load, showToast]);

  const handleDelete = useCallback(
    async (item: CannedResponseItem) => {
      if (!window.confirm(`Delete “${item.title}”?`)) return;
      const res = await deleteCannedResponse(item.id);
      if (!res.ok) {
        showToast({ tone: "error", title: "Couldn't delete", description: res.error });
        return;
      }
      await load();
    },
    [load, showToast],
  );

  return (
    <div className="page-stack">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/engagement">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Engagement
          </Link>
        </Button>
        <h1 className="text-2xl font-extrabold">Canned responses</h1>
      </div>

      <SectionCard title="New canned response">
        <div className="space-y-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short title" />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Message body…"
            rows={3}
            className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as CannedVisibility)}
              className="h-9 rounded-[11px] border border-border bg-white px-3 text-sm"
            >
              <option value="ORG">Recommended (org)</option>
              <option value="AUTO_SEND">Auto-send</option>
            </select>
            <Button onClick={handleCreate} disabled={busy || !title.trim() || !body.trim()}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add
            </Button>
          </div>
        </div>
      </SectionCard>

      {loading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {COLUMNS.map((col) => {
            const colItems = items.filter((i) => i.visibility === col.key);
            return (
              <SectionCard
                key={col.key}
                title={
                  <span className="flex items-center gap-1.5">
                    {col.key === "AUTO_SEND" ? <Zap className="h-3.5 w-3.5 text-warning-foreground" /> : null}
                    {col.title}
                  </span>
                }
                description={col.note}
                className={col.tint}
              >
                {colItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">None yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {colItems.map((item) => (
                      <li key={item.id} className="rounded-xl border border-border bg-white p-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-foreground">{item.title}</p>
                          <button
                            type="button"
                            aria-label="Delete"
                            onClick={() => handleDelete(item)}
                            className="text-muted-foreground hover:text-error"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
                        {item.dispositionCode ? (
                          <p className={cn("mt-2 text-[11px] font-bold uppercase tracking-[0.05em] text-primary")}>
                            Logs: {item.dispositionCode.replaceAll("_", " ")}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
