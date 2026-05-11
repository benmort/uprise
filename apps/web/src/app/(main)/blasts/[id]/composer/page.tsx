"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle2, MessageSquareText, Send, Trash2 } from "lucide-react";
import {
  createBlast,
  deleteBlast,
  getAudienceContacts,
  listBlasts,
  listAudiences,
  markBlastProofed,
  proofBlast,
  scheduleBlast,
  sendBlast,
  updateBlast,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TagChip } from "@/components/ui/tag-chip";
import { StatusBadge } from "@/components/ui/status-badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TooltipHint } from "@/components/ui/tooltip-hint";
import { useToast } from "@/components/ui/toast";

const FALLBACK_PERSONALIZATION_TAGS = ["{{first_name}}"];
const PERSONALIZATION_SAMPLE_LIMIT = 150;

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function pickFirstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function normalizePreviewContext(context: Record<string, unknown>): Record<string, unknown> {
  const nestedActionNetworkPerson =
    context.actionNetwork &&
    typeof context.actionNetwork === "object" &&
    !Array.isArray(context.actionNetwork) &&
    (context.actionNetwork as Record<string, unknown>).person &&
    typeof (context.actionNetwork as Record<string, unknown>).person === "object" &&
    !Array.isArray((context.actionNetwork as Record<string, unknown>).person)
      ? ((context.actionNetwork as Record<string, unknown>).person as Record<string, unknown>)
      : null;
  const firstName =
    pickFirstNonEmptyString(
      context.first_name,
      context.firstname,
      context.firstName,
      nestedActionNetworkPerson?.given_name,
      nestedActionNetworkPerson?.first_name,
    ) ?? "friend";
  return {
    ...context,
    first_name: firstName,
    firstname: firstName,
    firstName,
  };
}

function deriveAudiencePersonalization(
  rows: Array<Record<string, unknown>>,
): { tags: string[]; previewContext: Record<string, unknown> } {
  const metadataKeys = new Set<string>();
  let sampleMetadata: Record<string, unknown> | null = null;
  for (const row of rows) {
    const metadata = asRecord(row.metadata);
    const keys = Object.keys(metadata)
      .map((key) => key.trim())
      .filter(Boolean);
    for (const key of keys) metadataKeys.add(key);
    if (!sampleMetadata && keys.length > 0) {
      sampleMetadata = metadata;
    }
  }
  const tags = Array.from(metadataKeys)
    .sort((a, b) => a.localeCompare(b))
    .map((key) => `{{${key}}}`);
  return {
    tags,
    previewContext: normalizePreviewContext(sampleMetadata || {}),
  };
}

export default function BlastComposerPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const params = useParams<{ id: string }>();
  const templateRef = useRef<HTMLTextAreaElement | null>(null);
  const blastIdFromRoute = typeof params?.id === "string" ? params.id : "";
  const [campaignName, setCampaignName] = useState("");
  const [audiences, setAudiences] = useState<Array<Record<string, unknown>>>([]);
  const [audienceId, setAudienceId] = useState("");
  const [template, setTemplate] = useState("");
  const [blastId, setBlastId] = useState<string | null>(null);
  const [status, setStatus] = useState("DRAFTED");
  const [proof, setProof] = useState("");
  const [proofNumber, setProofNumber] = useState("");
  const [scheduleAt, setScheduleAt] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [complianceWarnings, setComplianceWarnings] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>(FALLBACK_PERSONALIZATION_TAGS);
  const [previewContext, setPreviewContext] = useState<Record<string, unknown>>(() =>
    normalizePreviewContext({}),
  );
  const [savingBlast, setSavingBlast] = useState(false);
  const [deletingBlast, setDeletingBlast] = useState(false);
  const [sendingBlast, setSendingBlast] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    listAudiences({ limit: 200, offset: 0 }).then((res) => {
      if (!res.ok) return;
      setAudiences(res.data.rows);
      const firstAudienceId = res.data.rows[0] ? String((res.data.rows[0] as any).id) : "";
      setAudienceId((prev) => prev || firstAudienceId);
    });
  }, []);

  useEffect(() => {
    if (!blastIdFromRoute) return;
    listBlasts().then((res) => {
      if (!res.ok) {
        setActionMessage(res.error);
        return;
      }
      const blast = res.data.find((row) => String((row as any).id) === blastIdFromRoute) as
        | Record<string, unknown>
        | undefined;
      if (!blast) {
        setActionMessage(`Blast not found: ${blastIdFromRoute}`);
        return;
      }
      setBlastId(String(blast.id));
      setCampaignName(String(blast.title || ""));
      setAudienceId(String(blast.audienceId || ""));
      setTemplate(String(blast.bodyTemplate || ""));
      setStatus(String(blast.status || "DRAFTED"));
    });
  }, [blastIdFromRoute]);

  useEffect(() => {
    let cancelled = false;
    if (!audienceId) {
      setAvailableTags(FALLBACK_PERSONALIZATION_TAGS);
      setPreviewContext(normalizePreviewContext({}));
      return;
    }
    getAudienceContacts(audienceId, { limit: PERSONALIZATION_SAMPLE_LIMIT, offset: 0 })
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          setAvailableTags(FALLBACK_PERSONALIZATION_TAGS);
          setPreviewContext(normalizePreviewContext({}));
          return;
        }
        const rows = Array.isArray(res.data.rows)
          ? (res.data.rows as Array<Record<string, unknown>>)
          : [];
        const personalization = deriveAudiencePersonalization(rows);
        setAvailableTags(
          personalization.tags.length > 0 ? personalization.tags : FALLBACK_PERSONALIZATION_TAGS,
        );
        setPreviewContext(personalization.previewContext);
      })
      .catch(() => {
        if (cancelled) return;
        setAvailableTags(FALLBACK_PERSONALIZATION_TAGS);
        setPreviewContext(normalizePreviewContext({}));
      });
    return () => {
      cancelled = true;
    };
  }, [audienceId]);

  const renderedPreview = useMemo(() => {
    let rendered = template;
    for (const [key, value] of Object.entries(previewContext)) {
      rendered = rendered.replaceAll(`{{${key}}}`, String(value));
    }
    return rendered;
  }, [previewContext, template]);

  const characterCount = template.length;
  const maxCharacters = 160;

  const validateDraft = () => {
    const nextErrors: string[] = [];
    if (!campaignName.trim()) nextErrors.push("Campaign name is required.");
    if (!audienceId.trim()) nextErrors.push("Select an audience before sending.");
    if (!template.trim()) nextErrors.push("Message content cannot be empty.");
    setValidationErrors(nextErrors);
    return nextErrors.length === 0;
  };

  const evaluateCompliance = (body: string) => {
    const warnings: string[] = [];
    if (!/reply\s+stop/i.test(body)) {
      warnings.push("Missing opt-out language. Include 'Reply STOP to opt out'.");
    }
    if (body.length > 320) {
      warnings.push("Message is long and may split into multiple SMS segments.");
    }
    setComplianceWarnings(warnings);
  };

  useEffect(() => {
    evaluateCompliance(template);
  }, [template]);

  useEffect(() => {
    if (!blastId) return;
    if (!campaignName.trim() && !template.trim()) return;
    setSaveState("saving");
    const timeout = window.setTimeout(async () => {
      const updated = await updateBlast(blastId, {
        title: campaignName,
        audienceId: audienceId || undefined,
        bodyTemplate: template,
      });
      if (!updated.ok) {
        setSaveState("error");
        setActionMessage(updated.error);
        return;
      }
      setStatus(String((updated.data as any).status || "DRAFTED"));
      setSaveState("saved");
      setLastSavedAt(new Date());
    }, 1200);
    return () => window.clearTimeout(timeout);
  }, [blastId, campaignName, audienceId, template]);

  const ensureBlast = async () => {
    if (blastId) return blastId;
    const created = await createBlast({
      title: campaignName,
      audienceId: audienceId || undefined,
      bodyTemplate: template,
    });
    if (!created.ok) {
      setActionMessage(created.error);
      return null;
    }
    const id = String((created.data as any).id);
    setBlastId(id);
    setStatus(String((created.data as any).status || "DRAFTED"));
    return id;
  };

  const saveBlastDraft = async () => {
    if (!validateDraft()) return;
    setSavingBlast(true);
    setSaveState("saving");
    try {
      if (!blastId) {
        const id = await ensureBlast();
        if (!id) return;
        setActionMessage("Blast saved");
        setSaveState("saved");
        setLastSavedAt(new Date());
        showToast({
          tone: "success",
          title: "Draft saved",
          description: "You can continue editing safely.",
        });
        return;
      }
      const updated = await updateBlast(blastId, {
        title: campaignName,
        audienceId: audienceId || undefined,
        bodyTemplate: template,
      });
      if (!updated.ok) {
        setActionMessage(updated.error);
        setSaveState("error");
        showToast({
          tone: "error",
          title: "Save failed",
          description: updated.error,
        });
        return;
      }
      setStatus(String((updated.data as any).status || "DRAFTED"));
      setActionMessage("Blast saved");
      setSaveState("saved");
      setLastSavedAt(new Date());
      showToast({
        tone: "success",
        title: "Draft saved",
      });
    } finally {
      setSavingBlast(false);
    }
  };

  const deleteCurrentBlast = async () => {
    if (!blastId) return;
    setDeletingBlast(true);
    try {
      const deleted = await deleteBlast(blastId);
      if (!deleted.ok) {
        setActionMessage(deleted.error);
        showToast({
          tone: "error",
          title: "Delete failed",
          description: deleted.error,
        });
        return;
      }
      setBlastId(null);
      setCampaignName("");
      setTemplate("");
      setStatus("DRAFTED");
      setProof("");
      setProofNumber("");
      setScheduleAt("");
      setActionMessage("Blast deleted");
      showToast({
        tone: "success",
        title: "Blast deleted",
      });
      router.replace("/dashboard");
    } finally {
      setDeletingBlast(false);
    }
  };

  const sendBlastNow = async () => {
    if (!validateDraft()) return;
    setSendingBlast(true);
    try {
      const id = await ensureBlast();
      if (!id) return;
      const proofed = await markBlastProofed(id);
      if (!proofed.ok) {
        setActionMessage(proofed.error);
        return;
      }
      const sent = await sendBlast(id);
      if (!sent.ok) {
        setActionMessage(sent.error);
        return;
      }
      setStatus(String((sent.data as any).blast?.status || "SENT"));
      setActionMessage(`Blast dispatched: ${(sent.data as any).sent || 0} sent`);
      showToast({
        tone: "success",
        title: "Blast sent",
        description: `${(sent.data as any).sent || 0} recipients queued.`,
      });
      router.push(`/blasts/${encodeURIComponent(id)}`);
    } finally {
      setSendingBlast(false);
    }
  };

  const insertTagIntoTemplate = (tag: string) => {
    const textarea = templateRef.current;
    if (!textarea) {
      setTemplate((prev) => `${prev} ${tag}`.trim());
      return;
    }
    const start = textarea.selectionStart || template.length;
    const end = textarea.selectionEnd || template.length;
    const next = `${template.slice(0, start)}${tag}${template.slice(end)}`;
    setTemplate(next);
    window.setTimeout(() => {
      textarea.focus();
      const cursor = start + tag.length;
      textarea.selectionStart = cursor;
      textarea.selectionEnd = cursor;
    }, 0);
  };

  return (
    <div className="page-stack">
      <Breadcrumbs
        items={[
          { label: "Analytics", href: "/analytics" },
          ...(blastId ? [{ label: "Blast Details", href: `/blasts/${encodeURIComponent(blastId)}` }] : []),
          { label: "Composer" },
        ]}
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <div className="space-y-3">
          <div>
            <h1 className="text-3xl font-semibold">Write and Launch Blast Message</h1>
            <p className="text-sm text-muted-foreground">
              Build your message, verify compliance, then send or schedule.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {saveState === "saving"
                ? "Autosave: Saving..."
                : saveState === "saved" && lastSavedAt
                  ? `Autosave: Saved at ${lastSavedAt.toLocaleTimeString()}`
                  : saveState === "error"
                    ? "Autosave: Failed"
                    : "Autosave: Idle"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={saveBlastDraft} disabled={savingBlast || deletingBlast}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {savingBlast ? "Saving..." : "Save Blast"}
            </Button>
            <Button
              variant="destructive"
              className="text-white hover:text-white"
              onClick={() => setShowDeleteDialog(true)}
              disabled={!blastId || deletingBlast || savingBlast}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {deletingBlast ? "Deleting..." : "Delete Blast"}
            </Button>
            <div className="mx-1 h-6 w-px bg-border" aria-hidden />
            <Button
              variant="outline"
              disabled={deletingBlast}
              onClick={async () => {
                if (!validateDraft()) return;
                if (!proofNumber.trim()) {
                  setActionMessage("Enter a proof number in E.164 format (e.g. +614xxxxxxxx).");
                  return;
                }
                const id = await ensureBlast();
                if (!id) return;
                const proofRes = await proofBlast(id, [previewContext], proofNumber.trim());
                if (!proofRes.ok) {
                  setActionMessage(proofRes.error);
                  showToast({
                    tone: "error",
                    title: "Proof failed",
                    description: proofRes.error,
                  });
                  return;
                }
                const rendered = proofRes.data.previews?.[0]?.rendered || "";
                setProof(rendered);
                const sentTo = proofRes.data.proofDispatch?.to;
                setActionMessage(sentTo ? `Proof sent to ${sentTo}` : "Proof generated");
                showToast({
                  tone: "success",
                  title: sentTo ? "Proof sent" : "Proof generated",
                  description: sentTo || undefined,
                });
              }}
            >
              <MessageSquareText className="mr-2 h-4 w-4" />
              Send Proof
            </Button>
            <Button
              disabled={deletingBlast || sendingBlast}
              onClick={() => setShowSendDialog(true)}
            >
              <Send className="mr-2 h-4 w-4" />
              {sendingBlast ? "Sending..." : "Send Now"}
            </Button>
          </div>
        </div>
        {validationErrors.length > 0 ? (
          <div className="rounded border border-error/40 bg-error-container px-3 py-2 text-sm text-error">
            {validationErrors.map((error) => (
              <p key={error}>- {error}</p>
            ))}
          </div>
        ) : null}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Campaign Details</CardTitle>
            <StatusBadge status={status} />
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-label uppercase tracking-[0.08em] text-muted-foreground">
                Campaign Name
              </label>
              <Input
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="Campaign name"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-label uppercase tracking-[0.08em] text-muted-foreground">
                Audience
              </label>
              <select
                className="h-11 w-full rounded border border-input bg-background px-3 py-2 text-sm"
                value={audienceId}
                onChange={(e) => setAudienceId(e.target.value)}
              >
                {audiences.map((audience) => (
                  <option key={String(audience.id)} value={String(audience.id)}>
                    {String(audience.name)} ({String((audience as any)._count?.contacts || 0)})
                  </option>
                ))}
              </select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="inline-flex items-center gap-1">
              Message Content
              <TooltipHint label="Use merge tags such as {{first_name}}. Drag chips into the message body." />
            </CardTitle>
            <span
              className={`rounded px-2 py-1 text-xs font-label ${characterCount > maxCharacters ? "bg-error-container text-error-foreground" : "bg-warning-container text-warning-foreground"}`}
            >
              {characterCount} / {maxCharacters} chars
            </span>
          </CardHeader>
          <CardContent className="space-y-3">
            <textarea
              ref={templateRef}
              className="min-h-[180px] w-full rounded border border-input bg-background p-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/35"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              onDrop={(event) => {
                event.preventDefault();
                const tag = event.dataTransfer.getData("text/plain");
                if (!tag.startsWith("{{")) return;
                insertTagIntoTemplate(tag);
              }}
              onDragOver={(event) => event.preventDefault()}
            />
            <div className="flex flex-wrap gap-2">
              {availableTags.map((tag) => (
                <TagChip
                  key={tag}
                  label={tag}
                  onClick={() => insertTagIntoTemplate(tag)}
                  onDragStart={(label, event) => {
                    event.dataTransfer.setData("text/plain", label);
                  }}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Advanced Delivery Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <details className="rounded border border-border p-3">
              <summary className="cursor-pointer text-sm font-medium">Proof and scheduling options</summary>
              <div className="mt-3 space-y-3">
                <div className="max-w-sm">
                  <label className="mb-1 block text-xs font-label uppercase tracking-[0.08em] text-muted-foreground">
                    Proof Number
                  </label>
                  <Input
                    value={proofNumber}
                    onChange={(e) => setProofNumber(e.target.value)}
                    placeholder="+614xxxxxxxx"
                  />
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="w-full max-w-xs">
                    <label className="mb-1 block text-xs font-label uppercase tracking-[0.08em] text-muted-foreground">
                      Send at
                    </label>
                    <Input
                      type="datetime-local"
                      value={scheduleAt}
                      onChange={(e) => setScheduleAt(e.target.value)}
                    />
                  </div>
                  <Button
                    variant="outline"
                    onClick={async () => {
                      if (!scheduleAt) return;
                      if (!validateDraft()) return;
                      const id = await ensureBlast();
                      if (!id) return;
                      const proofed = await markBlastProofed(id);
                      if (!proofed.ok) return setActionMessage(proofed.error);
                      const res = await scheduleBlast(id, new Date(scheduleAt).toISOString());
                      if (!res.ok) return setActionMessage(res.error);
                      setStatus(String((res.data as any).status || "SCHEDULED"));
                      setActionMessage("Blast scheduled");
                      showToast({
                        tone: "success",
                        title: "Blast scheduled",
                        description: new Date(scheduleAt).toLocaleString(),
                      });
                    }}
                  >
                    Schedule Blast
                  </Button>
                </div>
              </div>
            </details>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Live Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mx-auto w-full max-w-[300px]">
              <div className="relative overflow-hidden rounded-[2.4rem] border border-white/10 bg-black p-2 shadow-[0_30px_65px_rgba(0,0,0,0.45)]">
                <div className="relative aspect-[486/1024] overflow-hidden rounded-[2rem] bg-white">
                  <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center pt-1.5">
                    <div className="h-6 w-28 rounded-full border border-white/10 bg-black">
                      <div className="mx-auto mt-[6px] h-3 w-3 rounded-full bg-[#0f172a]" />
                    </div>
                  </div>
                  <div className="flex h-full items-start justify-end p-5 pt-14">
                    <div className="max-w-[86%] rounded-2xl rounded-br-md bg-primary px-3 py-2 text-sm leading-relaxed text-primary-foreground shadow-sm">
                      {proof || renderedPreview || "Your message preview will appear here."}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Privacy Compliance</CardTitle>
          </CardHeader>
          <CardContent>
            {complianceWarnings.length === 0 ? (
              <p className="text-sm text-success">No compliance warnings detected.</p>
            ) : (
              <ul className="space-y-2 text-sm text-error">
                {complianceWarnings.map((warning) => (
                  <li key={warning}>- {warning}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {actionMessage && (
          <Card>
            <CardContent className="pt-5">
              <p className="text-sm text-muted-foreground">{actionMessage}</p>
            </CardContent>
          </Card>
        )}
      </div>
      </div>
      <ConfirmDialog
        open={showDeleteDialog}
        title="Delete this blast?"
        description="This permanently removes the blast draft. This action cannot be undone."
        confirmLabel="Delete Blast"
        busy={deletingBlast}
        onCancel={() => setShowDeleteDialog(false)}
        onConfirm={async () => {
          setShowDeleteDialog(false);
          await deleteCurrentBlast();
        }}
      />
      <ConfirmDialog
        open={showSendDialog}
        title="Send blast now?"
        description="This will start sending messages to your selected audience immediately."
        confirmLabel="Send Blast"
        busy={sendingBlast}
        onCancel={() => setShowSendDialog(false)}
        onConfirm={async () => {
          setShowSendDialog(false);
          await sendBlastNow();
        }}
      />
    </div>
  );
}
