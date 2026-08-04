"use client";

import { useMemo, useState } from "react";
import { autodialer, telephony } from "@uprise/api-client";
import type { DialerCampaignRecord, DialerCampaignWithGraph } from "@uprise/contracts";
import { listAudiences } from "@/lib/api";
import { listFiles } from "@/lib/api/files";
import { useApi } from "@/lib/use-api";
import { behaviourOf } from "@/components/autodialer/behaviour";
import { SurveyGraphBuilder } from "@/components/autodialer/survey-graph-builder";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, Select, SelectItem, Switch } from "@uprise/ui";
import { useToast } from "@/components/ui/toast";

/**
 * The campaign editor — heavyweight, non-linear panels (NOT a wizard: only the
 * behaviour choice is irreversible, and the picker already made it). Prompts
 * are TTS-first ({ name } speaks via <Say>); an uploaded audio file (tenant
 * audio library, folder "autodialer") overrides per prompt.
 */

type PromptValue = { name?: string; audio?: string } | null;

const promptText = (prompt: unknown): string =>
  prompt && typeof prompt === "object" && typeof (prompt as { name?: unknown }).name === "string"
    ? ((prompt as { name: string }).name ?? "")
    : "";

const promptAudio = (prompt: unknown): string =>
  prompt && typeof prompt === "object" && typeof (prompt as { audio?: unknown }).audio === "string"
    ? ((prompt as { audio: string }).audio ?? "")
    : "";

function buildPrompt(text: string, audio: string): PromptValue {
  const name = text.trim();
  if (!name && !audio) return null;
  return { ...(name ? { name } : {}), ...(audio ? { audio } : {}) };
}

function PromptField({
  label,
  hint,
  text,
  audio,
  onText,
  onAudio,
  audioOptions,
}: {
  label: string;
  hint?: string;
  text: string;
  audio: string;
  onText: (value: string) => void;
  onAudio: (value: string) => void;
  audioOptions: Array<{ id: string; name: string }>;
}) {
  return (
    <Field label={label} hint={hint}>
      <div className="space-y-2">
        <Textarea value={text} onChange={(e) => onText(e.target.value)} rows={2} placeholder="Spoken text (TTS)…" />
        <Select
          value={audio || "none"}
          onValueChange={(value) => onAudio(value === "none" ? "" : value)}
          aria-label={`${label} audio`}
          className="w-full"
        >
          <SelectItem value="none">No recording — speak the text above</SelectItem>
          {audioOptions.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
            </SelectItem>
          ))}
        </Select>
      </div>
    </Field>
  );
}

export function CampaignEditor({
  campaign,
  onSaved,
}: {
  campaign: DialerCampaignWithGraph;
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const behaviour = behaviourOf(campaign).key;
  const locked = campaign.status === "COMPLETED" || campaign.status === "ARCHIVED";

  const [name, setName] = useState(campaign.name);
  const [audienceId, setAudienceId] = useState(campaign.audienceId ?? "");
  const [fromNumberId, setFromNumberId] = useState(campaign.fromNumberId ?? "");
  const [dailyStart, setDailyStart] = useState(campaign.dailyStart);
  const [dailyFinish, setDailyFinish] = useState(campaign.dailyFinish);
  const [periodMinutes, setPeriodMinutes] = useState(String(campaign.dialerPeriodMinutes));
  const [batchSize, setBatchSize] = useState(String(campaign.batchSize));
  const [maxAttempts, setMaxAttempts] = useState(String(campaign.maxCallAttempts));
  const [noCallHours, setNoCallHours] = useState(String(campaign.noCallWindowHours));
  const [amdEnabled, setAmdEnabled] = useState(campaign.amdEnabled);
  const [recordingEnabled, setRecordingEnabled] = useState(campaign.recordingEnabled);
  const [introText, setIntroText] = useState(promptText(campaign.intro));
  const [introAudio, setIntroAudio] = useState(promptAudio(campaign.intro));
  const [outroText, setOutroText] = useState(promptText(campaign.outro));
  const [outroAudio, setOutroAudio] = useState(promptAudio(campaign.outro));
  const [optOutText, setOptOutText] = useState(promptText(campaign.optOut));
  const [targetNumbers, setTargetNumbers] = useState((campaign.targetNumbers ?? []).join("\n"));
  const [jurisdiction, setJurisdiction] = useState<string>(campaign.jurisdiction ?? "FEDERAL");
  const [officeTarget, setOfficeTarget] = useState<string>(campaign.officeTarget ?? "electorate");
  const [partyTargets, setPartyTargets] = useState((campaign.partyTargets ?? []).join(", "));
  const [saving, setSaving] = useState(false);

  const audiences = useApi("/audiences|dialer-editor", () => listAudiences({ limit: 100, offset: 0 }), {
    ttlMs: 30_000,
  });
  const numbers = useApi("/telephony/numbers|dialer-editor", () => telephony.listNumbers(), { ttlMs: 30_000 });
  const audioFiles = useApi("/files|autodialer-audio", () => listFiles({ folder: "autodialer", take: 100 }), {
    ttlMs: 30_000,
  });

  const audienceRows = ((audiences.data as { rows?: Array<{ id: string; name?: string }> } | undefined)?.rows ?? []);
  const numberRows = ((numbers.data ?? []) as Array<{ id: string; phoneNumberE164?: string; nickname?: string | null }>);
  const audioOptions = useMemo(
    () =>
      (audioFiles.data?.rows ?? [])
        .filter((f) => (f.contentType ?? "").startsWith("audio/"))
        .map((f) => ({ id: f.id, name: f.name })),
    [audioFiles.data],
  );

  const save = async () => {
    if (saving || locked) return;
    setSaving(true);
    const res = await autodialer.update(campaign.id, {
      name: name.trim() || campaign.name,
      audienceId: audienceId || null,
      fromNumberId: fromNumberId || null,
      dailyStart,
      dailyFinish,
      dialerPeriodMinutes: Number(periodMinutes) || campaign.dialerPeriodMinutes,
      batchSize: Number(batchSize) || campaign.batchSize,
      maxCallAttempts: Number(maxAttempts) || campaign.maxCallAttempts,
      noCallWindowHours: Number(noCallHours) || campaign.noCallWindowHours,
      amdEnabled,
      recordingEnabled,
      intro: buildPrompt(introText, introAudio),
      outro: buildPrompt(outroText, outroAudio),
      optOut: optOutText.trim() ? { name: optOutText.trim() } : null,
      ...(behaviour === "transfer" || behaviour === "broadcast"
        ? {
            targetNumbers:
              behaviour === "transfer"
                ? targetNumbers
                    .split(/\n+/)
                    .map((n) => n.trim())
                    .filter(Boolean)
                : (campaign.targetNumbers ?? null),
          }
        : {}),
      ...(behaviour === "target"
        ? {
            jurisdiction: jurisdiction as DialerCampaignRecord["jurisdiction"],
            officeTarget: officeTarget as DialerCampaignRecord["officeTarget"],
            partyTargets: partyTargets
              .split(",")
              .map((p) => p.trim())
              .filter(Boolean),
            targetNumbers: targetNumbers
              .split(/\n+/)
              .map((n) => n.trim())
              .filter(Boolean),
          }
        : {}),
    } as Partial<DialerCampaignRecord>);
    setSaving(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Save failed", description: res.error });
      return;
    }
    showToast({ tone: "success", title: "Campaign saved" });
    onSaved();
  };

  return (
    <div className="space-y-4">
      {locked ? (
        <p className="rounded-lg bg-surface-variant px-3 py-2 text-sm text-muted-foreground">
          This campaign is {campaign.status.toLowerCase()} — clone it to make changes.
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3 p-4">
          <h3 className="text-sm font-semibold">Basics</h3>
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={locked} />
          </Field>
          <Field label="Audience" hint="Who gets called — opted-out and suppressed numbers are always excluded.">
            <Select
              value={audienceId || "none"}
              onValueChange={(v) => setAudienceId(v === "none" ? "" : v)}
              disabled={locked}
              className="w-full"
            >
              <SelectItem value="none">Choose an audience…</SelectItem>
              {audienceRows.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name ?? a.id}
                </SelectItem>
              ))}
            </Select>
          </Field>
          <Field label="Caller ID" hint="A provisioned tenant number; the platform number is the fallback.">
            <Select
              value={fromNumberId || "auto"}
              onValueChange={(v) => setFromNumberId(v === "auto" ? "" : v)}
              disabled={locked}
              className="w-full"
            >
              <SelectItem value="auto">Automatic (tenant default → platform)</SelectItem>
              {numberRows.map((n) => (
                <SelectItem key={n.id} value={n.id}>
                  {n.nickname ? `${n.nickname} — ` : ""}
                  {n.phoneNumberE164 ?? n.id}
                </SelectItem>
              ))}
            </Select>
          </Field>
          <div className="flex items-center justify-between">
            <span className="text-sm">Answering-machine detection</span>
            <Switch checked={amdEnabled} onCheckedChange={setAmdEnabled} disabled={locked} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Record calls</span>
            <Switch checked={recordingEnabled} onCheckedChange={setRecordingEnabled} disabled={locked} />
          </div>
        </Card>

        <Card className="space-y-3 p-4">
          <h3 className="text-sm font-semibold">Schedule &amp; pacing</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Window start" hint="Tenant timezone">
              <Input value={dailyStart} onChange={(e) => setDailyStart(e.target.value)} placeholder="09:00" disabled={locked} />
            </Field>
            <Field label="Window finish">
              <Input value={dailyFinish} onChange={(e) => setDailyFinish(e.target.value)} placeholder="20:00" disabled={locked} />
            </Field>
            <Field label="Calls per tick">
              <Input value={batchSize} onChange={(e) => setBatchSize(e.target.value)} inputMode="numeric" disabled={locked} />
            </Field>
            <Field label="Minutes between ticks">
              <Input value={periodMinutes} onChange={(e) => setPeriodMinutes(e.target.value)} inputMode="numeric" disabled={locked} />
            </Field>
            <Field label="Max attempts per number">
              <Input value={maxAttempts} onChange={(e) => setMaxAttempts(e.target.value)} inputMode="numeric" disabled={locked} />
            </Field>
            <Field label="Hours between attempts">
              <Input value={noCallHours} onChange={(e) => setNoCallHours(e.target.value)} inputMode="numeric" disabled={locked} />
            </Field>
          </div>
        </Card>
      </div>

      <Card className="space-y-3 p-4">
        <h3 className="text-sm font-semibold">Prompts</h3>
        <p className="text-xs text-muted-foreground">
          Text is spoken with the platform voice; pick a recording from the audio library (folder
          “autodialer”) to play instead. Campaigns work with zero uploads.
        </p>
        <div className="grid gap-3 lg:grid-cols-2">
          <PromptField
            label="Intro"
            hint="Plays as soon as the call is answered."
            text={introText}
            audio={introAudio}
            onText={setIntroText}
            onAudio={setIntroAudio}
            audioOptions={audioOptions}
          />
          <PromptField
            label="Outro"
            hint="Plays before hanging up."
            text={outroText}
            audio={outroAudio}
            onText={setOutroText}
            onAudio={setOutroAudio}
            audioOptions={audioOptions}
          />
        </div>
        <Field label="Opt-out confirmation" hint="Spoken after a caller presses star. Leave blank for the default.">
          <Textarea value={optOutText} onChange={(e) => setOptOutText(e.target.value)} rows={2} disabled={locked} />
        </Field>
      </Card>

      {behaviour === "transfer" ? (
        <Card className="space-y-3 p-4">
          <h3 className="text-sm font-semibold">Transfer targets</h3>
          <Field label="Target numbers" hint="One per line, +61 format. When several, one is picked per call.">
            <Textarea
              value={targetNumbers}
              onChange={(e) => setTargetNumbers(e.target.value)}
              rows={4}
              placeholder="+61262774022"
              disabled={locked}
              className="font-mono"
            />
          </Field>
        </Card>
      ) : null}

      {behaviour === "target" ? (
        <Card className="space-y-3 p-4">
          <h3 className="text-sm font-semibold">Electoral routing</h3>
          <p className="text-xs text-muted-foreground">
            Callers enter a postcode and are connected to their own member's office, resolved from
            the platform's civic data.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Jurisdiction">
              <Select value={jurisdiction} onValueChange={setJurisdiction} disabled={locked} className="w-full">
                {["FEDERAL", "NSW", "VIC", "QLD", "SA", "WA", "TAS", "ACT", "NT"].map((j) => (
                  <SelectItem key={j} value={j}>
                    {j}
                  </SelectItem>
                ))}
              </Select>
            </Field>
            <Field label="Chamber">
              <Select value={officeTarget} onValueChange={setOfficeTarget} disabled={locked} className="w-full">
                <SelectItem value="electorate">Lower house (local member)</SelectItem>
                <SelectItem value="upper">Upper house (senators)</SelectItem>
              </Select>
            </Field>
          </div>
          <Field label="Party filter" hint="Comma-separated; leave blank to connect whoever holds the seat.">
            <Input value={partyTargets} onChange={(e) => setPartyTargets(e.target.value)} disabled={locked} />
          </Field>
          <Field label="Fallback numbers" hint="Dialled when no member (or no office number) resolves. One per line.">
            <Textarea
              value={targetNumbers}
              onChange={(e) => setTargetNumbers(e.target.value)}
              rows={3}
              placeholder="+61262774022"
              disabled={locked}
              className="font-mono"
            />
          </Field>
        </Card>
      ) : null}

      {behaviour === "survey" ? (
        <SurveyGraphBuilder campaign={campaign} locked={locked} onSaved={onSaved} audioOptions={audioOptions} />
      ) : null}

      <div className="flex justify-end">
        <Button onClick={() => void save()} disabled={saving || locked}>
          {saving ? "Saving…" : "Save campaign"}
        </Button>
      </div>
    </div>
  );
}
