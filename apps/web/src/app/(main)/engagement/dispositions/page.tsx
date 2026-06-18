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
import { Skeleton } from "@/components/ui/skeleton";
import { SectionCard } from "@/components/canvass/section-card";
import { SupportPill } from "@/components/canvass/support-pill";
import { SUPPORT_ORDER } from "@/components/canvass/support-level";
import { useToast } from "@/components/ui/toast";

function slugify(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export default function DispositionsPage() {
  const { showToast } = useToast();
  const [defs, setDefs] = useState<DispositionDef[]>([]);
  const [loading, setLoading] = useState(true);

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

  const handleAdd = useCallback(async () => {
    const label = window.prompt("New contact-result disposition (label)");
    if (!label?.trim()) return;
    const res = await createDispositionDef({ code: slugify(label), label: label.trim() });
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't add", description: res.error });
      return;
    }
    await load();
    showToast({ tone: "success", title: "Disposition added", description: res.data.label });
  }, [load, showToast]);

  const handleEdit = useCallback(
    async (d: DispositionDef) => {
      const label = window.prompt("Rename disposition", d.label);
      if (!label?.trim() || label === d.label) return;
      const res = await updateDispositionDef(d.id, { label: label.trim() });
      if (!res.ok) {
        showToast({ tone: "error", title: "Couldn't update", description: res.error });
        return;
      }
      await load();
    },
    [load, showToast],
  );

  const handleDelete = useCallback(
    async (d: DispositionDef) => {
      if (!window.confirm(`Delete “${d.label}”?`)) return;
      const res = await deleteDispositionDef(d.id);
      if (!res.ok) {
        showToast({ tone: "error", title: "Couldn't delete", description: res.error });
        return;
      }
      await load();
      showToast({ tone: "success", title: "Deleted" });
    },
    [load, showToast],
  );

  const editable = (d: DispositionDef) => !d.isLocked && d.organizationId !== null;

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
              <Button size="sm" variant="outline" onClick={handleAdd}>
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
                        onClick={() => handleEdit(d)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Delete"
                        onClick={() => handleDelete(d)}
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
    </div>
  );
}
