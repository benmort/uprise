"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Pencil, Plus, Trash2, Zap } from "lucide-react";
import {
  createCannedResponse,
  deleteCannedResponse,
  listCannedResponses,
  listDispositions,
  updateCannedResponse,
  type CannedResponseItem,
  type CannedVisibility,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectItem } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { FormDialog } from "@/components/ui/form-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionCard } from "@uprise/field";
import { useApi } from "@/lib/use-api";
import { StateRegion } from "@/components/shell/state-region";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type Channel = "SMS" | "DOOR" | "BOTH";

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

const EMPTY = { title: "", body: "", visibility: "ORG" as CannedVisibility, channel: "SMS" as Channel, dispositionCode: "" };

export default function CannedResponsesPage() {
  const { showToast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CannedResponseItem | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CannedResponseItem | null>(null);
  // Backend filters channel IN (selected, BOTH), so SMS-only hid every DOOR reply.
  // Filtering by SMS or DOOR each also surfaces BOTH-channel responses.
  const [channelFilter, setChannelFilter] = useState<"SMS" | "DOOR">("SMS");

  // Two lists back this page – the channel-scoped responses, plus the
  // contact-result dispositions that populate the "logs" select. Combine their
  // feedback states so one 403/500 surfaces for the whole surface.
  const cr = useApi(
    `/canned-responses?channel=${channelFilter}`,
    () => listCannedResponses(channelFilter),
    { ttlMs: 30_000 },
  );
  const disp = useApi("/dispositions", () => listDispositions(), { ttlMs: 30_000 });
  const loading = cr.loading || disp.loading;
  const error = cr.error ?? disp.error;
  const noPermission = cr.noPermission || disp.noPermission;
  const items = (cr.data ?? []) as unknown as CannedResponseItem[];
  const dispositions = (disp.data ?? []).filter((d) => d.layer === "CONTACT_RESULT");

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setDialogOpen(true);
  };

  const openEdit = (item: CannedResponseItem) => {
    setEditing(item);
    setForm({
      title: item.title,
      body: item.body,
      visibility: item.visibility,
      channel: item.channel,
      dispositionCode: item.dispositionCode ?? "",
    });
    setDialogOpen(true);
  };

  const submit = useCallback(async () => {
    if (!form.title.trim() || !form.body.trim()) return;
    setBusy(true);
    const payload = {
      title: form.title.trim(),
      body: form.body.trim(),
      visibility: form.visibility,
      channel: form.channel,
      dispositionCode: form.dispositionCode || undefined,
    };
    const res = editing
      ? await updateCannedResponse(editing.id, payload)
      : await createCannedResponse(payload);
    setBusy(false);
    if (!res.ok) {
      showToast({ tone: "error", title: editing ? "Couldn't update" : "Couldn't add", description: res.error });
      return;
    }
    setDialogOpen(false);
    void cr.refetch();
    showToast({ tone: "success", title: editing ? "Canned response updated" : "Canned response added" });
  }, [editing, form, cr.refetch, showToast]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setBusy(true);
    const res = await deleteCannedResponse(deleteTarget.id);
    setBusy(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't delete", description: res.error });
      return;
    }
    setDeleteTarget(null);
    void cr.refetch();
    showToast({ tone: "success", title: "Deleted" });
  }, [deleteTarget, cr.refetch, showToast]);

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
        <select
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value as "SMS" | "DOOR")}
          className="ml-auto h-9 rounded-md border border-input bg-background px-2 text-sm"
          aria-label="Filter by channel"
        >
          <option value="SMS">SMS &amp; both</option>
          <option value="DOOR">Door &amp; both</option>
        </select>
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-1.5 h-4 w-4" />
          New canned response
        </Button>
      </div>

      <StateRegion
        loading={loading}
        error={error}
        noPermission={noPermission}
        onRetry={() => {
          void cr.refetch();
          void disp.refetch();
        }}
        empty={items.length === 0}
        emptyTitle="No canned responses yet"
        emptyDescription="Reusable replies for SMS and door conversations appear here."
        skeleton={<Skeleton className="h-48 w-full" />}
      >
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
                      <li key={item.id} className="rounded-xl border border-border bg-surface p-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-foreground">{item.title}</p>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              aria-label="Edit"
                              onClick={() => openEdit(item)}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              aria-label="Delete"
                              onClick={() => setDeleteTarget(item)}
                              className="text-muted-foreground hover:text-error"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
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
      </StateRegion>

      <FormDialog
        open={dialogOpen}
        title={editing ? "Edit canned response" : "New canned response"}
        onClose={() => setDialogOpen(false)}
        onSubmit={submit}
        submitLabel={editing ? "Save" : "Add"}
        busy={busy}
        submitDisabled={!form.title.trim() || !form.body.trim()}
      >
        <Field label="Title" htmlFor="cr-title" required>
          <Input
            id="cr-title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Short title"
            autoFocus
          />
        </Field>
        <Field label="Message body" htmlFor="cr-body" required>
          <Textarea
            id="cr-body"
            value={form.body}
            onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            placeholder="Message body…"
            rows={4}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Visibility" htmlFor="cr-visibility">
            <Select
              id="cr-visibility"
              value={form.visibility}
              onValueChange={(v) => setForm((f) => ({ ...f, visibility: v as CannedVisibility }))}
            >
              <SelectItem value="ORG">Recommended (org)</SelectItem>
              <SelectItem value="PERSONAL">Personal (mine)</SelectItem>
              <SelectItem value="AUTO_SEND">Auto-send</SelectItem>
            </Select>
          </Field>
          <Field label="Channel" htmlFor="cr-channel">
            <Select
              id="cr-channel"
              value={form.channel}
              onValueChange={(v) => setForm((f) => ({ ...f, channel: v as Channel }))}
            >
              <SelectItem value="SMS">SMS</SelectItem>
              <SelectItem value="DOOR">Door</SelectItem>
              <SelectItem value="BOTH">Both</SelectItem>
            </Select>
          </Field>
        </div>
        <Field label="Logs disposition" htmlFor="cr-disp" hint="Using this reply records this disposition.">
          <Select
            id="cr-disp"
            value={form.dispositionCode || "__none__"}
            onValueChange={(v) =>
              setForm((f) => ({ ...f, dispositionCode: v === "__none__" ? "" : v }))
            }
          >
            <SelectItem value="__none__">— none —</SelectItem>
            {dispositions.map((d) => (
              <SelectItem key={d.id} value={d.code}>
                {d.label}
              </SelectItem>
            ))}
          </Select>
        </Field>
      </FormDialog>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete canned response"
        description={deleteTarget ? `Delete “${deleteTarget.title}”?` : ""}
        confirmLabel="Delete"
        busy={busy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
