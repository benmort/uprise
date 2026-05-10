"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
  const params = useParams<{ id: string }>();
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
    setSavingBlast(true);
    try {
      if (!blastId) {
        const id = await ensureBlast();
        if (!id) return;
        setActionMessage("Blast saved");
        return;
      }
      const updated = await updateBlast(blastId, {
        title: campaignName,
        audienceId: audienceId || undefined,
        bodyTemplate: template,
      });
      if (!updated.ok) {
        setActionMessage(updated.error);
        return;
      }
      setStatus(String((updated.data as any).status || "DRAFTED"));
      setActionMessage("Blast saved");
    } finally {
      setSavingBlast(false);
    }
  };

  const deleteCurrentBlast = async () => {
    if (!blastId) return;
    const confirmed = window.confirm("Delete this blast? This action cannot be undone.");
    if (!confirmed) return;
    setDeletingBlast(true);
    try {
      const deleted = await deleteBlast(blastId);
      if (!deleted.ok) {
        setActionMessage(deleted.error);
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
      router.replace("/dashboard");
    } finally {
      setDeletingBlast(false);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-4xl font-semibold">Composer</h1>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={saveBlastDraft} disabled={savingBlast || deletingBlast}>
              {savingBlast ? "Saving..." : "Save Blast"}
            </Button>
            <Button
              variant="warning"
              onClick={deleteCurrentBlast}
              disabled={!blastId || deletingBlast || savingBlast}
            >
              {deletingBlast ? "Deleting..." : "Delete Blast"}
            </Button>
            <Button
              variant="outline"
              disabled={deletingBlast}
              onClick={async () => {
                if (!proofNumber.trim()) {
                  setActionMessage("Enter a proof number in E.164 format (e.g. +614xxxxxxxx).");
                  return;
                }
                const id = await ensureBlast();
                if (!id) return;
                const proofRes = await proofBlast(id, [previewContext], proofNumber.trim());
                if (!proofRes.ok) {
                  setActionMessage(proofRes.error);
                  return;
                }
                const rendered = proofRes.data.previews?.[0]?.rendered || "";
                setProof(rendered);
                const sentTo = proofRes.data.proofDispatch?.to;
                setActionMessage(sentTo ? `Proof sent to ${sentTo}` : "Proof generated");
              }}
            >
              Send Proof
            </Button>
            <Button
              disabled={deletingBlast}
              onClick={async () => {
                const id = await ensureBlast();
                if (!id) return;
                const proofed = await markBlastProofed(id);
                if (!proofed.ok) return setActionMessage(proofed.error);
                const sent = await sendBlast(id);
                if (!sent.ok) return setActionMessage(sent.error);
                setStatus(String((sent.data as any).blast?.status || "SENT"));
                setActionMessage(`Blast dispatched: ${(sent.data as any).sent || 0} sent`);
              }}
            >
              Send Now
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Campaign Details</CardTitle>
            <StatusBadge status={status} />
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
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
                className="h-10 w-full rounded border border-input bg-background px-3 py-2 text-sm"
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
            <div className="space-y-1">
              <label className="text-xs font-label uppercase tracking-[0.08em] text-muted-foreground">
                Proof Number
              </label>
              <Input
                value={proofNumber}
                onChange={(e) => setProofNumber(e.target.value)}
                placeholder="+614xxxxxxxx"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Message Content</CardTitle>
            <span
              className={`rounded px-2 py-1 text-xs font-label ${characterCount > maxCharacters ? "bg-error-container text-error-foreground" : "bg-warning-container text-warning-foreground"}`}
            >
              {characterCount} / {maxCharacters} chars
            </span>
          </CardHeader>
          <CardContent className="space-y-3">
            <textarea
              className="min-h-[180px] w-full rounded border border-input bg-background p-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/35"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              {availableTags.map((tag) => (
                <TagChip
                  key={tag}
                  label={tag}
                  onClick={() => setTemplate((prev) => `${prev} ${tag}`.trim())}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Schedule</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-2">
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
                const id = await ensureBlast();
                if (!id) return;
                const proofed = await markBlastProofed(id);
                if (!proofed.ok) return setActionMessage(proofed.error);
                const res = await scheduleBlast(id, new Date(scheduleAt).toISOString());
                if (!res.ok) return setActionMessage(res.error);
                setStatus(String((res.data as any).status || "SCHEDULED"));
                setActionMessage("Blast scheduled");
              }}
            >
              Schedule Blast
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Live Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mx-auto w-[300px] rounded-[2rem] border border-border bg-surface p-3">
              <div className="rounded-[1.5rem] border border-border bg-white p-4">
                <p className="mb-2 text-xs font-label uppercase tracking-[0.08em] text-muted-foreground">
                  Recipient sample
                </p>
                <p className="rounded-xl bg-surface px-3 py-2 text-sm leading-relaxed">
                  {proof || renderedPreview}
                </p>
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
  );
}
