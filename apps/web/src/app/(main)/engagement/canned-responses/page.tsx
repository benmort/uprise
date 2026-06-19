"use client";

import { useCallback, useEffect, useState } from "react";
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
  type DispositionDef,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { FormDialog } from "@/components/ui/form-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionCard } from "@/components/canvass/section-card";
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
  const [items, setItems] = useState<CannedResponseItem[]>([]);
  const [dispositions, setDispositions] = useState<DispositionDef[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CannedResponseItem | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CannedResponseItem | null>(null);

  const load = useCallback(async () => {
    const [res, disp] = await Promise.all([listCannedResponses("SMS"), listDispositions()]);
    if (res.ok) setItems(res.data as unknown as CannedResponseItem[]);
    if (disp.ok) setDispositions(disp.data.filter((d) => d.layer === "CONTACT_RESULT"));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
    await load();
    showToast({ tone: "success", title: editing ? "Canned response updated" : "Canned response added" });
  }, [editing, form, load, showToast]);

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
    await load();
    showToast({ tone: "success", title: "Deleted" });
  }, [deleteTarget, load, showToast]);

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
        <Button className="ml-auto" size="sm" onClick={openCreate}>
          <Plus className="mr-1.5 h-4 w-4" />
          New canned response
        </Button>
      </div>

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
      )}

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
              onChange={(e) => setForm((f) => ({ ...f, visibility: e.target.value as CannedVisibility }))}
            >
              <option value="ORG">Recommended (org)</option>
              <option value="PERSONAL">Personal (mine)</option>
              <option value="AUTO_SEND">Auto-send</option>
            </Select>
          </Field>
          <Field label="Channel" htmlFor="cr-channel">
            <Select
              id="cr-channel"
              value={form.channel}
              onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value as Channel }))}
            >
              <option value="SMS">SMS</option>
              <option value="DOOR">Door</option>
              <option value="BOTH">Both</option>
            </Select>
          </Field>
        </div>
        <Field label="Logs disposition" htmlFor="cr-disp" hint="Using this reply records this disposition.">
          <Select
            id="cr-disp"
            value={form.dispositionCode}
            onChange={(e) => setForm((f) => ({ ...f, dispositionCode: e.target.value }))}
          >
            <option value="">— none —</option>
            {dispositions.map((d) => (
              <option key={d.id} value={d.code}>
                {d.label}
              </option>
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
