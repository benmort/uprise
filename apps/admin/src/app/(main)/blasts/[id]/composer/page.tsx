"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle2, MessageSquareText, Send, Trash2 } from "lucide-react";
import {
  createAudience,
  createBlast,
  deleteBlast,
  getAudienceContacts,
  getAudienceWhatsappReach,
  getFeatureFlags,
  listBlasts,
  listAudiences,
  listWhatsappTemplates,
  markBlastProofed,
  proofBlast,
  scheduleBlast,
  sendBlast,
  updateBlast,
  type MessageChannel,
  type WhatsappTemplate,
} from "@/lib/api";
import { tourComposerIntent } from "@/lib/tours/uprise-tour";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TagChip } from "@/components/ui/tag-chip";
import { StatusBadge } from "@/components/ui/status-badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Skeleton } from "@/components/ui/skeleton";
import { StateRegion } from "@/components/shell/state-region";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormDialog } from "@/components/ui/form-dialog";
import { Field } from "@/components/ui/field";
import { TooltipHint } from "@/components/ui/tooltip-hint";
import { useToast } from "@/components/ui/toast";
import { useLocalStorage, PhoneInput } from "@uprise/ui";
import { profile } from "@uprise/api-client";
import { FromNumberSelector } from "@/components/blasts/from-number-selector";
import { listCampaigns } from "@/lib/api/campaigns";

// Always-available personalization tags, independent of the audience's columns: first name and
// the recipient's suburb ({{location}}). Both are derived server-side (with graceful fallbacks)
// in the blasts TemplateRendererService, so they resolve for every recipient.
const STANDARD_PERSONALIZATION_TAGS = ["{{first_name}}", "{{location}}"];
const PERSONALIZATION_SAMPLE_LIMIT = 150;

// Opt-out detection for the SMS compliance check. A message is compliant if it tells recipients
// how to opt out — the STOP keyword used as an instruction, or explicit "opt out"/"unsubscribe"
// language — NOT only the rigid "reply STOP". So "Reply YES to volunteer or STOP to opt out" passes.
const OPT_OUT_PATTERNS: RegExp[] = [
  /\b(reply|text|sms|send|txt)\b[^.!?\n]*\bstop\b/i, // "reply/text … STOP"
  /\bstop\b[^.!?\n]*\b(to\s+)?(opt[\s-]?out|unsubscrib\w*|end|cancel|quit|leave|stop)\b/i, // "STOP to opt out/unsubscribe/end/cancel"
  /\b(opt[\s-]?out|unsubscrib\w*)\b[^.!?\n]*\bstop\b/i, // "opt out … STOP"
  /\b(opt[\s-]?out|unsubscribe)\b/i, // explicit opt-out phrasing (no STOP keyword)
];
function hasOptOutLanguage(body: string): boolean {
  return OPT_OUT_PATTERNS.some((re) => re.test(body));
}

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
  // Mirror the server-side {{location}} derivation (blasts TemplateRendererService) so the live
  // preview matches what recipients receive: the suburb from any of these columns, else "your area".
  const anAddress =
    nestedActionNetworkPerson && Array.isArray(nestedActionNetworkPerson.postal_addresses)
      ? (nestedActionNetworkPerson.postal_addresses[0] as Record<string, unknown> | undefined)
      : undefined;
  const location =
    pickFirstNonEmptyString(
      context.location,
      context.suburb,
      context.locality,
      context.city,
      context.town,
      anAddress?.locality,
    ) ?? "your area";
  return {
    ...context,
    first_name: firstName,
    firstname: firstName,
    firstName,
    location,
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
  const metaTags = Array.from(metadataKeys)
    .sort((a, b) => a.localeCompare(b))
    .map((key) => `{{${key}}}`);
  // Standard tags first (first name, location), then the audience's own columns — deduped.
  const tags = Array.from(new Set([...STANDARD_PERSONALIZATION_TAGS, ...metaTags]));
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
  const [channel, setChannel] = useState<MessageChannel>("SMS");
  // Text-bank linkage: the canvass campaign this blast belongs to + P2P mode (volunteers
  // press-send each initial message; the dispatch cron never auto-batches a P2P wave).
  const [linkedCampaignId, setLinkedCampaignId] = useState("");
  const [p2p, setP2p] = useState(false);
  const [smsCampaigns, setSmsCampaigns] = useState<Array<{ id: string; name: string }>>([]);
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [waReach, setWaReach] = useState<{ total: number; reachable: number } | null>(null);
  const [newWaAudienceOpen, setNewWaAudienceOpen] = useState(false);
  const [newWaAudienceName, setNewWaAudienceName] = useState("");
  const [creatingWaAudience, setCreatingWaAudience] = useState(false);
  const [groupInviteLink, setGroupInviteLink] = useState("");
  const [waTemplates, setWaTemplates] = useState<WhatsappTemplate[]>([]);
  const [contentSid, setContentSid] = useState("");
  const [contentVariableMap, setContentVariableMap] = useState<Record<string, string>>({});
  const [blastId, setBlastId] = useState<string | null>(null);
  const [status, setStatus] = useState("DRAFTED");
  const [proof, setProof] = useState("");
  const [proofNumber, setProofNumber] = useState("");
  // Explicit send-from number (TelephonyPhoneNumber id); null ⇒ the tenant default sender.
  const [fromNumberId, setFromNumberId] = useState<string | null>(null);
  const [scheduleAt, setScheduleAt] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [complianceWarnings, setComplianceWarnings] = useState<string[]>([]);
  // Per-user default for whether the privacy-compliance checks run (persisted on this device).
  const [complianceEnabled, setComplianceEnabled] = useLocalStorage("uprise.blast.complianceChecks", true);
  const [availableTags, setAvailableTags] = useState<string[]>(STANDARD_PERSONALIZATION_TAGS);
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
  const [loadingBlast, setLoadingBlast] = useState(Boolean(blastIdFromRoute));
  const [noPermission, setNoPermission] = useState(false);

  useEffect(() => {
    getFeatureFlags().then((res) => {
      if (res.ok) setWhatsappEnabled(Boolean(res.data.FEATURE_WHATSAPP_ENABLED));
    });
  }, []);

  // Bridge for the WhatsApp guided tour: lets a tour step flip this composer into
  // WhatsApp mode (and auto-pick a template) so the WhatsApp-only UI is revealed.
  const waTemplatesRef = useRef<WhatsappTemplate[]>([]);
  useEffect(() => {
    tourComposerIntent.setChannel = (ch) => {
      setChannel(ch);
      if (ch === "WHATSAPP") {
        setWhatsappEnabled(true);
        const first = waTemplatesRef.current[0];
        if (first) setContentSid((sid) => sid || first.contentSid);
      }
    };
    return () => {
      tourComposerIntent.setChannel = () => {};
    };
  }, []);

  useEffect(() => {
    if (!whatsappEnabled) return;
    listWhatsappTemplates("approved").then((res) => {
      if (res.ok) {
        setWaTemplates(res.data);
        waTemplatesRef.current = res.data;
      }
    });
  }, [whatsappEnabled]);

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
    setLoadingBlast(true);
    setNoPermission(false);
    listBlasts().then((res) => {
      if (!res.ok) {
        if (res.status === 403) setNoPermission(true);
        else setActionMessage(res.error);
        setLoadingBlast(false);
        return;
      }
      const blast = res.data.find((row) => String((row as any).id) === blastIdFromRoute) as
        | Record<string, unknown>
        | undefined;
      if (!blast) {
        setActionMessage(`Blast not found: ${blastIdFromRoute}`);
        setLoadingBlast(false);
        return;
      }
      setBlastId(String(blast.id));
      setCampaignName(String(blast.title || ""));
      setAudienceId(String(blast.audienceId || ""));
      setTemplate(String(blast.bodyTemplate || ""));
      setStatus(String(blast.status || "DRAFTED"));
      setChannel((blast.channel as MessageChannel) || "SMS");
      setContentSid(String(blast.contentSid || ""));
      setFromNumberId((blast.fromNumberId as string) || null);
      setLinkedCampaignId(String(blast.campaignId || ""));
      setP2p(Boolean((blast.metadata as Record<string, unknown> | null)?.p2p));
      setContentVariableMap(
        blast.contentVariableMap && typeof blast.contentVariableMap === "object"
          ? (blast.contentVariableMap as Record<string, string>)
          : {},
      );
      setLoadingBlast(false);
    });
  }, [blastIdFromRoute]);

  useEffect(() => {
    let cancelled = false;
    if (!audienceId) {
      setAvailableTags(STANDARD_PERSONALIZATION_TAGS);
      setPreviewContext(normalizePreviewContext({}));
      return;
    }
    getAudienceContacts(audienceId, { limit: PERSONALIZATION_SAMPLE_LIMIT, offset: 0 })
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          setAvailableTags(STANDARD_PERSONALIZATION_TAGS);
          setPreviewContext(normalizePreviewContext({}));
          return;
        }
        const rows = Array.isArray(res.data.rows)
          ? (res.data.rows as Array<Record<string, unknown>>)
          : [];
        const personalization = deriveAudiencePersonalization(rows);
        setAvailableTags(
          personalization.tags.length > 0 ? personalization.tags : STANDARD_PERSONALIZATION_TAGS,
        );
        setPreviewContext(personalization.previewContext);
      })
      .catch(() => {
        if (cancelled) return;
        setAvailableTags(STANDARD_PERSONALIZATION_TAGS);
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
  const isWhatsapp = channel === "WHATSAPP";

  // For WhatsApp campaigns, only offer WhatsApp + Both audiences (incl. the smart list).
  const visibleAudiences = useMemo(() => {
    if (!isWhatsapp) return audiences;
    return audiences.filter((a) => {
      const ch = String((a as { channel?: string }).channel ?? "ALL");
      return ch === "WHATSAPP" || ch === "ALL";
    });
  }, [audiences, isWhatsapp]);

  // Show how many of the selected audience are actually WhatsApp-reachable (opted in).
  useEffect(() => {
    if (!isWhatsapp || !audienceId) {
      setWaReach(null);
      return;
    }
    let alive = true;
    void getAudienceWhatsappReach(audienceId).then((r) => {
      if (alive) setWaReach(r.ok ? r.data : null);
    });
    return () => {
      alive = false;
    };
  }, [isWhatsapp, audienceId]);

  // If the current selection isn't a WhatsApp audience, fall back to the first valid one.
  useEffect(() => {
    if (!isWhatsapp || !audienceId) return;
    if (!visibleAudiences.some((a) => String(a.id) === audienceId)) {
      setAudienceId(visibleAudiences[0] ? String(visibleAudiences[0].id) : "");
    }
  }, [isWhatsapp, visibleAudiences, audienceId]);

  const selectedTemplate = useMemo(
    () => waTemplates.find((t) => t.contentSid === contentSid) || null,
    [waTemplates, contentSid],
  );

  const templateSlots = useMemo<string[]>(() => {
    const vars = selectedTemplate?.variables;
    if (Array.isArray(vars)) return vars.map((v) => String(v));
    if (vars && typeof vars === "object") return Object.keys(vars as Record<string, unknown>);
    return [];
  }, [selectedTemplate]);

  const whatsappPreview = useMemo(() => {
    let rendered = selectedTemplate?.bodyPreview || template;
    for (const [slot, key] of Object.entries(contentVariableMap)) {
      const value = previewContext[key];
      rendered = rendered.replaceAll(`{{${slot}}}`, value == null ? "" : String(value));
    }
    return rendered;
  }, [selectedTemplate, template, contentVariableMap, previewContext]);

  // A proof only needs message content to render + send to a manually-entered number, so it skips
  // the audience + campaign-name checks a real send requires (`forProof`).
  const validateDraft = ({ forProof = false }: { forProof?: boolean } = {}) => {
    const nextErrors: string[] = [];
    if (!forProof && !campaignName.trim()) nextErrors.push("Campaign name is required.");
    if (!forProof && !audienceId.trim()) nextErrors.push("Select an audience before sending.");
    if (isWhatsapp) {
      if (!contentSid) nextErrors.push("Select an approved WhatsApp template.");
    } else if (!template.trim()) {
      nextErrors.push("Message content cannot be empty.");
    }
    setValidationErrors(nextErrors);
    return nextErrors.length === 0;
  };

  const evaluateCompliance = (body: string) => {
    if (!complianceEnabled) {
      setComplianceWarnings([]);
      return;
    }
    const warnings: string[] = [];
    if (isWhatsapp) {
      warnings.push("WhatsApp requires recorded opt-in. Only opted-in contacts will receive this blast.");
      setComplianceWarnings(warnings);
      return;
    }
    if (!hasOptOutLanguage(body)) {
      warnings.push("Missing opt-out language. Include 'Reply STOP to opt out'.");
    }
    if (body.length > 320) {
      warnings.push("Message is long and may split into multiple SMS segments.");
    }
    setComplianceWarnings(warnings);
  };

  useEffect(() => {
    evaluateCompliance(template);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template, channel, complianceEnabled]);

  // Default the Proof Number to the current user's own phone — they almost always proof to
  // themselves. Best-effort + only when the field is still empty, so it never clobbers a typed value.
  useEffect(() => {
    let alive = true;
    void profile.get().then((res) => {
      if (!alive || !res.ok) return;
      const mine = res.data.phone?.trim();
      if (mine) setProofNumber((cur) => cur || mine);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!blastId) return;
    if (!campaignName.trim() && !template.trim()) return;
    setSaveState("saving");
    const timeout = window.setTimeout(async () => {
      const updated = await updateBlast(blastId, blastPayload());
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blastId, campaignName, audienceId, template, channel, contentSid, contentVariableMap, fromNumberId]);

  useEffect(() => {
    let alive = true;
    void listCampaigns().then((res) => {
      if (alive && res.ok) {
        setSmsCampaigns(
          res.data
            .filter((c) => c.channel === "SMS" || c.channel === "BOTH")
            .map((c) => ({ id: c.id, name: c.name })),
        );
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const blastPayload = () => ({
    title: campaignName,
    audienceId: audienceId || undefined,
    bodyTemplate: template,
    channel,
    fromNumberId: fromNumberId || undefined,
    campaignId: linkedCampaignId || undefined,
    p2p,
    ...(channel === "WHATSAPP"
      ? { contentSid: contentSid || undefined, contentVariableMap }
      : {}),
  });

  const ensureBlast = async () => {
    if (blastId) return blastId;
    const created = await createBlast(blastPayload());
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
      const updated = await updateBlast(blastId, blastPayload());
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

  if (noPermission) {
    return (
      <div className="page-stack">
        <Breadcrumbs
          items={[
            ...(blastId ? [{ label: "Blast Details", href: `/blasts/${encodeURIComponent(blastId)}` }] : []),
            { label: "Composer" },
          ]}
        />
        <StateRegion noPermission>{null}</StateRegion>
      </div>
    );
  }

  if (loadingBlast) {
    return (
      <div className="page-stack">
        <Breadcrumbs
          items={[
            ...(blastId ? [{ label: "Blast Details", href: `/blasts/${encodeURIComponent(blastId)}` }] : []),
            { label: "Composer" },
          ]}
        />
        <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
          <div className="space-y-4">
            <Skeleton className="h-9 w-80" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <Breadcrumbs
        items={[
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
                if (!validateDraft({ forProof: true })) return;
                if (!proofNumber.trim()) {
                  setActionMessage("Enter a mobile number to send the proof to.");
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
              id="tour-composer-send"
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
            {whatsappEnabled ? (
              <div id="tour-composer-channel" className="space-y-1 md:col-span-2">
                <label className="text-xs font-label uppercase tracking-[0.08em] text-muted-foreground">
                  Channel
                </label>
                <div className="inline-flex rounded border border-input p-0.5">
                  {(["SMS", "WHATSAPP"] as MessageChannel[]).map((ch) => (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => setChannel(ch)}
                      className={`rounded px-4 py-1.5 text-sm font-medium transition ${
                        channel === ch
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {ch === "WHATSAPP" ? "WhatsApp" : "SMS"}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div id="tour-composer-name" className="space-y-1">
              <label className="text-xs font-label uppercase tracking-[0.08em] text-muted-foreground">
                Campaign Name
              </label>
              <Input
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="Campaign name"
              />
            </div>
            <div id="tour-composer-audience" className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-label uppercase tracking-[0.08em] text-muted-foreground">
                  {isWhatsapp ? "WhatsApp audience" : "Audience"}
                </label>
                {isWhatsapp ? (
                  <button
                    type="button"
                    onClick={() => {
                      setNewWaAudienceName("");
                      setNewWaAudienceOpen(true);
                    }}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    + New WhatsApp audience
                  </button>
                ) : null}
              </div>
              <select
                className="h-11 w-full rounded border border-input bg-background px-3 py-2 text-sm"
                value={audienceId}
                onChange={(e) => setAudienceId(e.target.value)}
              >
                {visibleAudiences.length === 0 ? (
                  <option value="">No WhatsApp audiences yet — create one</option>
                ) : null}
                {visibleAudiences.map((audience) => (
                  <option key={String(audience.id)} value={String(audience.id)}>
                    {String(audience.name)} ({String((audience as any)._count?.contacts || 0)})
                  </option>
                ))}
              </select>
              {isWhatsapp && waReach ? (
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold text-[hsl(var(--success))]">{waReach.reachable.toLocaleString()}</span>{" "}
                  of {waReach.total.toLocaleString()} WhatsApp-reachable (opted in)
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="inline-flex items-center gap-1">
              {isWhatsapp ? "WhatsApp Template" : "Message Content"}
              <TooltipHint label="Use merge tags such as {{first_name}}. Drag chips into the message body." />
            </CardTitle>
            {isWhatsapp ? null : (
              <span
                className={`rounded px-2 py-1 text-xs font-label ${characterCount > maxCharacters ? "bg-error-container text-error-foreground" : "bg-warning-container text-warning-foreground"}`}
              >
                {characterCount} / {maxCharacters} chars
              </span>
            )}
          </CardHeader>
          {isWhatsapp ? (
            <CardContent id="tour-composer-wa" className="space-y-4">
              {waTemplates.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No approved WhatsApp templates found. Sync templates from Twilio, then refresh.
                </p>
              ) : (
                <div id="tour-composer-wa-template" className="space-y-1">
                  <label className="text-xs font-label uppercase tracking-[0.08em] text-muted-foreground">
                    Approved template
                  </label>
                  <select
                    className="h-11 w-full rounded border border-input bg-background px-3 py-2 text-sm"
                    value={contentSid}
                    onChange={(e) => {
                      setContentSid(e.target.value);
                      setContentVariableMap({});
                    }}
                  >
                    <option value="">Select a template…</option>
                    {waTemplates.map((t) => (
                      <option key={t.contentSid} value={t.contentSid}>
                        {t.friendlyName} ({t.language} · {t.category})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {templateSlots.length > 0 ? (
                <div className="space-y-2">
                  <label className="text-xs font-label uppercase tracking-[0.08em] text-muted-foreground">
                    Map template variables
                  </label>
                  {templateSlots.map((slot) => (
                    <div key={slot} className="flex items-center gap-2">
                      <span className="w-16 shrink-0 text-sm text-muted-foreground">{`{{${slot}}}`}</span>
                      <select
                        className="h-10 w-full rounded border border-input bg-background px-2 text-sm"
                        value={contentVariableMap[slot] || ""}
                        onChange={(e) =>
                          setContentVariableMap((prev) => ({ ...prev, [slot]: e.target.value }))
                        }
                      >
                        <option value="">— pick a field —</option>
                        {availableTags.map((tag) => {
                          const key = tag.replace(/[{}]/g, "");
                          return (
                            <option key={key} value={key}>
                              {key}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  ))}
                </div>
              ) : null}
            </CardContent>
          ) : (
          <CardContent className="space-y-3">
            <textarea
              id="tour-composer-message"
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
            <div id="tour-composer-tags" className="flex flex-wrap gap-2">
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
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="inline-flex items-center gap-1">
              WhatsApp group invite link
              <TooltipHint label="The compliant way to reach native groups: invite people to a group you run in the WhatsApp app. (Twilio can't post to groups directly.)" />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <Input
                value={groupInviteLink}
                onChange={(e) => setGroupInviteLink(e.target.value)}
                placeholder="https://chat.whatsapp.com/…"
              />
              <Button
                variant="outline"
                disabled={!groupInviteLink.trim()}
                onClick={() =>
                  setTemplate((t) => `${t ? `${t}\n\n` : ""}Join our WhatsApp group: ${groupInviteLink.trim()}`)
                }
              >
                Add to message
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Appends a join CTA to the message body (or map it into a template variable for approved templates).
            </p>
          </CardContent>
        </Card>

        <Card id="tour-composer-proof">
          <CardHeader>
            <CardTitle>Advanced Delivery Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <details className="rounded border border-border p-3">
              <summary className="cursor-pointer text-sm font-medium">Proof and scheduling options</summary>
              <div className="mt-3 space-y-3">
                {channel !== "WHATSAPP" ? (
                  <FromNumberSelector value={fromNumberId} onChange={setFromNumberId} />
                ) : null}
                {channel === "SMS" ? (
                  <div className="max-w-sm space-y-2">
                    <label className="mb-1 block text-xs font-label uppercase tracking-[0.08em] text-muted-foreground">
                      Text bank (canvass campaign)
                    </label>
                    <select
                      value={linkedCampaignId}
                      onChange={(e) => setLinkedCampaignId(e.target.value)}
                      className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground"
                    >
                      <option value="">Not linked — standalone blast</option>
                      {smsCampaigns.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        checked={p2p}
                        disabled={!linkedCampaignId}
                        onChange={(e) => setP2p(e.target.checked)}
                        className="h-4 w-4 accent-[#465fff]"
                      />
                      P2P text bank — volunteers press-send each message (never auto-blasted)
                    </label>
                  </div>
                ) : null}
                <div className="max-w-sm">
                  <label className="mb-1 block text-xs font-label uppercase tracking-[0.08em] text-muted-foreground">
                    Proof Number
                  </label>
                  <PhoneInput value={proofNumber} onChange={setProofNumber} />
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
        <Card id="tour-composer-preview">
          <CardHeader>
            <CardTitle>Live Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mx-auto w-full max-w-[300px]">
              <div className="relative overflow-hidden rounded-[2.4rem] border border-white/10 bg-black p-2 shadow-[0_30px_65px_rgba(0,0,0,0.45)]">
                <div className="relative aspect-[486/1024] overflow-hidden rounded-[2rem] bg-white dark:bg-[#0b141a]">
                  <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center pt-1.5">
                    <div className="h-6 w-28 rounded-full border border-white/10 bg-black">
                      <div className="mx-auto mt-[6px] h-3 w-3 rounded-full bg-[#0f172a]" />
                    </div>
                  </div>
                  <div
                    className={`flex h-full items-start justify-end p-5 pt-14 ${isWhatsapp ? "bg-[#e5ddd5] dark:bg-[#0b141a]" : ""}`}
                  >
                    <div
                      className={`max-w-[86%] px-3 py-2 text-sm leading-relaxed shadow-sm ${
                        isWhatsapp
                          ? "rounded-lg rounded-tr-sm bg-[#dcf8c6] text-[#111b21] dark:bg-[#005c4b] dark:text-[#e9edef]"
                          : "rounded-2xl rounded-br-md bg-primary text-primary-foreground"
                      }`}
                    >
                      {proof ||
                        (isWhatsapp ? whatsappPreview : renderedPreview) ||
                        (isWhatsapp
                          ? "Select a template to preview the WhatsApp message."
                          : "Your message preview will appear here.")}
                      {isWhatsapp ? (
                        <span className="ml-1 align-bottom text-[10px] text-[#34b7f1]">✓✓</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card id="tour-composer-compliance">
          <CardHeader>
            <CardTitle>Privacy Compliance</CardTitle>
          </CardHeader>
          <CardContent>
            {!complianceEnabled ? (
              <p className="text-sm text-muted-foreground">Compliance checks are off.</p>
            ) : complianceWarnings.length === 0 ? (
              <p className="text-sm text-success">No compliance warnings detected.</p>
            ) : (
              <ul className="space-y-2 text-sm text-error">
                {complianceWarnings.map((warning) => (
                  <li key={warning}>- {warning}</li>
                ))}
              </ul>
            )}
            {/* Per-user default: whether these checks run. Persisted on this device. */}
            <label className="mt-3 flex cursor-pointer items-center gap-2 border-t border-border pt-3 text-sm text-muted-foreground">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={complianceEnabled}
                onChange={(e) => setComplianceEnabled(e.target.checked)}
              />
              Run compliance checks on my blasts
            </label>
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

      <FormDialog
        open={newWaAudienceOpen}
        title="New WhatsApp audience"
        description="A WhatsApp broadcast list. Add contacts from the Audience page after creating."
        onClose={() => setNewWaAudienceOpen(false)}
        submitLabel="Create"
        busy={creatingWaAudience}
        submitDisabled={!newWaAudienceName.trim()}
        onSubmit={async () => {
          setCreatingWaAudience(true);
          const res = await createAudience({
            name: newWaAudienceName.trim(),
            source: "MANUAL",
            channel: "WHATSAPP",
          });
          setCreatingWaAudience(false);
          if (!res.ok) {
            showToast({ tone: "error", title: "Couldn't create", description: res.error });
            return;
          }
          const created = res.data as { id: string; name: string };
          const refreshed = await listAudiences({ limit: 200, offset: 0 });
          if (refreshed.ok) setAudiences(refreshed.data.rows);
          setAudienceId(String(created.id));
          setNewWaAudienceOpen(false);
          showToast({ tone: "success", title: "WhatsApp audience created", description: created.name });
        }}
      >
        <Field label="Audience name" htmlFor="wa-aud-name" required>
          <Input
            id="wa-aud-name"
            value={newWaAudienceName}
            onChange={(e) => setNewWaAudienceName(e.target.value)}
            placeholder="e.g. Northcote WhatsApp list"
            autoFocus
          />
        </Field>
      </FormDialog>
    </div>
  );
}
