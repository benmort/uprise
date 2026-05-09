"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  createBlast,
  listBlasts,
  listAudiences,
  markBlastProofed,
  proofBlast,
  scheduleBlast,
  sendBlast,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TagChip } from "@/components/ui/tag-chip";
import { StatusBadge } from "@/components/ui/status-badge";

const DEFAULT_TEMPLATE =
  "Hi {{first_name}}! It's been a while since we saw you in {{city}}. Your membership is expiring soon. Renew today with code {{discount_code}}. Reply STOP to opt out.";
const PERSONALIZATION_TAGS = ["{{first_name}}", "{{city}}", "{{discount_code}}", "{{expiry_date}}"];

export default function ComposerPage() {
  const searchParams = useSearchParams();
  const blastIdFromQuery = searchParams.get("blastId");
  const [campaignName, setCampaignName] = useState("");
  const [audiences, setAudiences] = useState<Array<Record<string, unknown>>>([]);
  const [audienceId, setAudienceId] = useState("");
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [blastId, setBlastId] = useState<string | null>(null);
  const [status, setStatus] = useState("DRAFTED");
  const [proof, setProof] = useState("");
  const [scheduleAt, setScheduleAt] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [complianceWarnings, setComplianceWarnings] = useState<string[]>([]);

  useEffect(() => {
    listAudiences({ limit: 200, offset: 0 }).then((res) => {
      if (!res.ok) return;
      setAudiences(res.data.rows);
      const firstAudienceId = res.data.rows[0] ? String((res.data.rows[0] as any).id) : "";
      setAudienceId((prev) => prev || firstAudienceId);
    });
  }, []);

  useEffect(() => {
    if (!blastIdFromQuery) return;
    listBlasts().then((res) => {
      if (!res.ok) {
        setActionMessage(res.error);
        return;
      }
      const blast = res.data.find((row) => String((row as any).id) === blastIdFromQuery) as
        | Record<string, unknown>
        | undefined;
      if (!blast) {
        setActionMessage(`Blast not found: ${blastIdFromQuery}`);
        return;
      }
      setBlastId(String(blast.id));
      setCampaignName(String(blast.title || ""));
      setAudienceId(String(blast.audienceId || ""));
      setTemplate(String(blast.bodyTemplate || DEFAULT_TEMPLATE));
      setStatus(String(blast.status || "DRAFTED"));
    });
  }, [blastIdFromQuery]);

  const sampleRecipient = useMemo(
    () => ({
      first_name: "Sarah",
      city: "Chicago",
      discount_code: "RENEW24",
      expiry_date: "May 31",
    }),
    [],
  );

  const renderedPreview = useMemo(() => {
    let rendered = template;
    for (const [key, value] of Object.entries(sampleRecipient)) {
      rendered = rendered.replaceAll(`{{${key}}}`, String(value));
    }
    return rendered;
  }, [sampleRecipient, template]);

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

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-4xl font-semibold">Composer</h1>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={async () => {
                const id = await ensureBlast();
                if (!id) return;
                const proofRes = await proofBlast(id, [sampleRecipient]);
                if (!proofRes.ok) {
                  setActionMessage(proofRes.error);
                  return;
                }
                const rendered = proofRes.data.previews?.[0]?.rendered || "";
                setProof(rendered);
                setActionMessage("Proof generated");
              }}
            >
              Send Proof
            </Button>
            <Button
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
          <CardContent className="grid gap-3 md:grid-cols-[1fr_280px]">
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Message Content</CardTitle>
            <span className={`rounded px-2 py-1 text-xs font-label ${characterCount > maxCharacters ? "bg-error-container text-error-foreground" : "bg-warning-container text-warning-foreground"}`}>
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
              {PERSONALIZATION_TAGS.map((tag) => (
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
            <CardTitle>TCPA Compliance</CardTitle>
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
