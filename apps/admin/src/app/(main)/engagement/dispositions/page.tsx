"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import {
  createDispositionDef,
  deleteDispositionDef,
  listDispositions,
  updateDispositionDef,
  type DispositionDef,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { FormDialog } from "@/components/ui/form-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionCard } from "@uprise/field";
import { SupportPill } from "@uprise/field";
import { SUPPORT_ORDER } from "@uprise/field";
import { useToast } from "@/components/ui/toast";

type Channel = "DOOR" | "SMS" | "BOTH";

function slugify(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export default function DispositionsPage() {
  const { showToast } = useToast();
  const [defs, setDefs] = useState<DispositionDef[]>([]);
  const [loading, setLoading] = useState(true);

  // Create/edit dialog state.
  const [editing, setEditing] = useState<DispositionDef | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [code, setCode] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);
  const [channel, setChannel] = useState<Channel>("BOTH");
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DispositionDef | null>(null);

  const load = useCallback(async () => {
    const res = await listDispositions();
    if (res.ok) setDefs(res.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const contact = defs.filter((d) => d.layer === "CONTACT_RESULT");
  const terminal = defs.filter((d) => d.layer !== "CONTACT_RESULT");

  const openCreate = () => {
    setEditing(null);
    setLabel("");
    setCode("");
    setCodeTouched(false);
    setChannel("BOTH");
    setDialogOpen(true);
  };

  const openEdit = (d: DispositionDef) => {
    setEditing(d);
    setLabel(d.label);
    setCode(d.code);
    setCodeTouched(true);
    setChannel(d.channel);
    setDialogOpen(true);
  };

  const onLabelChange = (v: string) => {
    setLabel(v);
    if (!editing && !codeTouched) setCode(slugify(v));
  };

  const submit = useCallback(async () => {
    if (!label.trim() || !code.trim()) return;
    setBusy(true);
    const res = editing
      ? await updateDispositionDef(editing.id, { label: label.trim(), channel })
      : await createDispositionDef({ code: slugify(code), label: label.trim(), channel });
    setBusy(false);
    if (!res.ok) {
      showToast({ tone: "error", title: editing ? "Couldn't update" : "Couldn't add", description: res.error });
      return;
    }
    setDialogOpen(false);
    await load();
    showToast({ tone: "success", title: editing ? "Disposition updated" : "Disposition added", description: label.trim() });
  }, [editing, label, code, channel, load, showToast]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setBusy(true);
    const res = await deleteDispositionDef(deleteTarget.id);
    setBusy(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't delete", description: res.error });
      return;
    }
    setDeleteTarget(null);
    await load();
    showToast({ tone: "success", title: "Deleted" });
  }, [deleteTarget, load, showToast]);

  const editable = (d: DispositionDef) => !d.isLocked && d.tenantId !== null;

  return (
    <div className="page-stack">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/engagement">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Engagement
          </Link>
        </Button>
        <h1 className="text-2xl font-extrabold">Dispositions</h1>
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <SectionCard
            title="Contact results"
            description="Did we reach a human? Editable per campaign."
            action={
              <Button size="sm" variant="outline" onClick={openCreate}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add code
              </Button>
            }
          >
            <ul className="space-y-1.5">
              {contact.map((d) => (
                <li key={d.id} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2">
                  <span className="flex-1 text-sm font-medium text-foreground">{d.label}</span>
                  <code className="rounded bg-surface-variant px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {d.code}
                  </code>
                  {editable(d) ? (
                    <>
                      <button
                        type="button"
                        aria-label="Edit"
                        onClick={() => openEdit(d)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Delete"
                        onClick={() => setDeleteTarget(d)}
                        className="text-muted-foreground hover:text-error"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  ) : (
                    <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard
            title="Terminal / data quality"
            description="Locked system defaults — keep cross-org benchmarking valid."
          >
            <ul className="space-y-1.5">
              {terminal.map((d) => (
                <li key={d.id} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2">
                  <span className="flex-1 text-sm font-medium text-foreground">{d.label}</span>
                  <code className="rounded bg-surface-variant px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {d.code}
                  </code>
                  <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>
      )}

      <SectionCard title="Support-level scale" description="The campaign-defined support dimension.">
        <div className="flex flex-wrap gap-2">
          {SUPPORT_ORDER.map((level) => (
            <SupportPill key={level} level={level} />
          ))}
        </div>
      </SectionCard>

      <FormDialog
        open={dialogOpen}
        title={editing ? "Edit disposition" : "New contact-result disposition"}
        onClose={() => setDialogOpen(false)}
        onSubmit={submit}
        submitLabel={editing ? "Save" : "Add"}
        busy={busy}
        submitDisabled={!label.trim() || !code.trim()}
      >
        <Field label="Label" htmlFor="disp-label" required>
          <Input
            id="disp-label"
            value={label}
            onChange={(e) => onLabelChange(e.target.value)}
            placeholder="e.g. Spoke to target"
            autoFocus
          />
        </Field>
        <Field
          label="Code"
          htmlFor="disp-code"
          required
          hint={editing ? "The code can't change after creation." : "Stable machine value — auto-filled from the label."}
        >
          <Input
            id="disp-code"
            value={code}
            onChange={(e) => {
              setCodeTouched(true);
              setCode(slugify(e.target.value));
            }}
            placeholder="spoke_to_target"
            disabled={!!editing}
          />
        </Field>
        <Field label="Channel" htmlFor="disp-channel">
          <Select id="disp-channel" value={channel} onValueChange={(v) => setChannel(v as Channel)}>
            <SelectItem value="BOTH">Both (door + SMS)</SelectItem>
            <SelectItem value="DOOR">Door</SelectItem>
            <SelectItem value="SMS">SMS</SelectItem>
          </Select>
        </Field>
      </FormDialog>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete disposition"
        description={deleteTarget ? `Delete “${deleteTarget.label}”? This can't be undone.` : ""}
        confirmLabel="Delete"
        busy={busy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
