"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CornerDownRight, Plus, Save, Trash2 } from "lucide-react";
import {
  createScript,
  deleteScript,
  getScript,
  listScripts,
  updateScript,
  type Script,
  type ScriptListItem,
  type ScriptStep,
} from "@/lib/api/engagement";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectItem } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { FormDialog } from "@/components/ui/form-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/canvass/section-card";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export default function ScriptsPage() {
  const { showToast } = useToast();
  const [list, setList] = useState<ScriptListItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<Script | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newChannel, setNewChannel] = useState("BOTH");
  const [creating, setCreating] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const loadList = useCallback(async () => {
    const res = await listScripts();
    if (res.ok) {
      setList(res.data);
      setSelectedId((cur) => cur || res.data[0]?.id || "");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) {
      setDraft(null);
      return;
    }
    void getScript(selectedId).then((r) => r.ok && setDraft(r.data));
  }, [selectedId]);

  const openCreate = () => {
    setNewName("");
    setNewChannel("BOTH");
    setCreateOpen(true);
  };

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return;
    setCreating(true);
    const res = await createScript({
      name: newName.trim(),
      channel: newChannel,
      steps: [{ bodyText: "Hi, I'm a volunteer — do you have a moment?", orderIndex: 0 }],
    });
    setCreating(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't create", description: res.error });
      return;
    }
    setCreateOpen(false);
    await loadList();
    setSelectedId(res.data.id);
  }, [newName, newChannel, loadList, showToast]);

  const patchStep = (i: number, patch: Partial<ScriptStep>) => {
    if (!draft) return;
    setDraft({ ...draft, steps: draft.steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) });
  };

  const handleSave = useCallback(async () => {
    if (!draft) return;
    // Every step needs body text; branch steps (after the opener) need an outcome key.
    if (!draft.steps.length) {
      showToast({ tone: "error", title: "Can't save script", description: "Add at least one step." });
      return;
    }
    for (let i = 0; i < draft.steps.length; i += 1) {
      const s = draft.steps[i];
      if (!String(s.bodyText ?? "").trim()) {
        showToast({ tone: "error", title: "Can't save script", description: `Step ${i + 1}: enter the body text.` });
        return;
      }
      if (i > 0 && !String(s.outcomeKey ?? "").trim()) {
        showToast({ tone: "error", title: "Can't save script", description: `Step ${i + 1}: enter an outcome key (e.g. interested).` });
        return;
      }
    }
    setBusy(true);
    const res = await updateScript(draft.id, { name: draft.name, steps: draft.steps });
    setBusy(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't save", description: res.error });
      return;
    }
    setDraft(res.data);
    await loadList();
    showToast({ tone: "success", title: "Script saved" });
  }, [draft, loadList, showToast]);

  const handleDelete = useCallback(async () => {
    if (!draft) return;
    setBusy(true);
    const res = await deleteScript(draft.id);
    setBusy(false);
    setDeleteOpen(false);
    if (res.ok) {
      setSelectedId("");
      await loadList();
      showToast({ tone: "success", title: "Script deleted" });
    } else {
      showToast({ tone: "error", title: "Couldn't delete", description: res.error });
    }
  }, [draft, loadList, showToast]);

  if (loading) return <div className="page-stack"><Skeleton className="h-64 w-full" /></div>;

  return (
    <div className="page-stack">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/engagement">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Engagement
          </Link>
        </Button>
        <h1 className="text-2xl font-extrabold">Scripts</h1>
        <Button className="ml-auto" onClick={openCreate}>
          <Plus className="mr-1.5 h-4 w-4" />
          New script
        </Button>
      </div>

      {list.length === 0 ? (
        <EmptyState
          title="No scripts yet"
          description="An opening line plus outcome-keyed branches for the conversation."
          ctaLabel="New script"
          onCta={openCreate}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[200px_1fr]">
          <div className="space-y-2">
            {list.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedId(s.id)}
                className={cn(
                  "w-full rounded-xl border p-3 text-left text-sm transition",
                  s.id === selectedId ? "border-primary bg-[#eef2fd]" : "border-border bg-white hover:bg-surface-variant",
                )}
              >
                <span className="font-semibold text-foreground">{s.name}</span>
                <span className="block text-xs text-muted-foreground">{s.stepCount} steps</span>
              </button>
            ))}
          </div>

          {draft ? (
            <SectionCard
              title={
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className="h-8 max-w-xs"
                />
              }
              action={
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" className="text-error" onClick={() => setDeleteOpen(true)}>
                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                    Delete
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={busy}>
                    <Save className="mr-1.5 h-3.5 w-3.5" />
                    Save
                  </Button>
                </div>
              }
            >
              <div className="space-y-2">
                {draft.steps.map((step, i) => (
                  <div
                    key={i}
                    className={cn(
                      "rounded-xl border p-3",
                      i === 0 ? "border-primary/40 bg-primary-container/40" : "border-border ml-4",
                    )}
                  >
                    {i === 0 ? (
                      <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.05em] text-primary">Opening line</p>
                    ) : (
                      <div className="mb-1 flex items-center gap-1.5">
                        <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          value={step.outcomeKey ?? ""}
                          onChange={(e) => patchStep(i, { outcomeKey: e.target.value })}
                          placeholder="If… (outcome key, e.g. interested)"
                          className="h-7 max-w-[220px] text-xs"
                        />
                      </div>
                    )}
                    <Textarea
                      value={step.bodyText}
                      onChange={(e) => patchStep(i, { bodyText: e.target.value })}
                      rows={2}
                    />
                    {i > 0 ? (
                      <button
                        type="button"
                        onClick={() => setDraft({ ...draft, steps: draft.steps.filter((_, idx) => idx !== i) })}
                        className="mt-1 text-xs text-muted-foreground hover:text-error"
                      >
                        Remove branch
                      </button>
                    ) : null}
                  </div>
                ))}
                <Button
                  variant="outline"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      steps: [...draft.steps, { bodyText: "", outcomeKey: "", orderIndex: draft.steps.length }],
                    })
                  }
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  Add branch
                </Button>
              </div>
            </SectionCard>
          ) : null}
        </div>
      )}

      <FormDialog
        open={createOpen}
        title="New script"
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
        submitLabel="Create"
        busy={creating}
        submitDisabled={!newName.trim()}
      >
        <Field label="Script name" htmlFor="script-name" required>
          <Input
            id="script-name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Doorstep opener"
            autoFocus
          />
        </Field>
        <Field label="Channel" htmlFor="script-channel" hint="Where this script is used.">
          <Select id="script-channel" value={newChannel} onValueChange={setNewChannel}>
            <SelectItem value="BOTH">Both (door + SMS)</SelectItem>
            <SelectItem value="DOOR">Door</SelectItem>
            <SelectItem value="SMS">SMS</SelectItem>
          </Select>
        </Field>
      </FormDialog>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete script"
        description={draft ? `Delete “${draft.name}”? This can't be undone.` : ""}
        confirmLabel="Delete"
        busy={busy}
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}
