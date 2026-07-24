"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BadgeDollarSign,
  Bot,
  Brain,
  Cable,
  Check,
  FolderOpen,
  ShieldCheck,
  Sparkles,
  UserRound,
  Wand2,
} from "lucide-react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Field, Input, Textarea } from "@uprise/ui";
import { useToast } from "@/components/ui/toast";
import type { AuthPrincipal } from "@uprise/api-client";
import { getSession } from "@/lib/session";
import {
  AI_MODEL_OPTIONS,
  AI_TONE_OPTIONS,
  loadAiSettings,
  saveAiSettings,
  type AiSettings,
} from "@/lib/ai/settings";
import { cn } from "@/lib/utils";
import { AI_SECTION_GROUPS, AI_SECTION_LABELS, type AiSection } from "./sections";

const SECTION_ICONS: Record<AiSection, typeof UserRound> = {
  general: UserRound,
  billing: BadgeDollarSign,
  personalization: Wand2,
  memory: Brain,
  files: FolderOpen,
  model: Bot,
  connectors: Cable,
  "data-controls": ShieldCheck,
};

function ComingSoon() {
  return (
    <Badge variant="secondary" className="ml-auto">
      Coming soon
    </Badge>
  );
}

/** TailAdmin ai-settings layout: grouped left rail + content cards. */
export function AiSettingsShell({ active }: { active: AiSection }) {
  const { showToast } = useToast();
  const [principal, setPrincipal] = useState<AuthPrincipal | null>(null);
  const [settings, setSettings] = useState<AiSettings | null>(null);

  useEffect(() => {
    setSettings(loadAiSettings());
    void getSession().then((s) => setPrincipal(s));
  }, []);

  const save = (next: AiSettings) => {
    setSettings(next);
    saveAiSettings(next);
    showToast({ tone: "success", title: "AI settings saved" });
  };

  return (
    <div className="page-stack">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-semibold">
          <Sparkles className="h-6 w-6 text-primary" /> AI settings
        </h1>
        <p className="text-sm text-muted-foreground">
          How the assistant behaves for you.{" "}
          <Link href="/future/ai/assistant" className="text-primary hover:underline">
            Back to the assistant
          </Link>
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        {/* Grouped rail */}
        <nav className="h-fit rounded-xl border border-border bg-surface p-3 lg:sticky lg:top-4">
          <div className="flex gap-1 overflow-x-auto lg:flex-col lg:gap-4 lg:overflow-visible">
            {AI_SECTION_GROUPS.map((group) => (
              <div key={group.label} className="flex shrink-0 gap-1 lg:block lg:shrink">
                <p className="hidden px-2 pb-1.5 text-xs font-label uppercase tracking-[0.08em] text-muted-foreground lg:block">
                  {group.label}
                </p>
                {group.sections.map((section) => {
                  const Icon = SECTION_ICONS[section];
                  return (
                    <Link
                      key={section}
                      href={`/future/ai/settings/${section}`}
                      className={cn(
                        "flex items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-2 text-sm transition-colors",
                        section === active
                          ? "bg-primary/10 font-medium text-primary"
                          : "text-foreground hover:bg-surface-variant",
                      )}
                    >
                      <Icon className="h-4 w-4" /> {AI_SECTION_LABELS[section]}
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
        </nav>

        {/* Content */}
        <div className="min-w-0 space-y-4">
          {active === "general" ? <GeneralSection principal={principal} /> : null}
          {active === "personalization" && settings ? (
            <PersonalizationSection settings={settings} onSave={save} />
          ) : null}
          {active === "model" && settings ? <ModelSection settings={settings} onSave={save} /> : null}
          {active === "billing" ? <BillingSection /> : null}
          {active === "memory" ? <MemorySection /> : null}
          {active === "files" ? <FilesSection /> : null}
          {active === "connectors" ? <ConnectorsSection /> : null}
          {active === "data-controls" ? <DataControlsSection /> : null}
        </div>
      </div>
    </div>
  );
}

function GeneralSection({ principal }: { principal: AuthPrincipal | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserRound className="h-4 w-4 text-muted-foreground" /> General
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">Signed in as</p>
            <p className="mt-0.5 font-medium">{principal?.email ?? "—"}</p>
            <p className="text-xs text-muted-foreground">{principal?.isSuperAdmin ? "Super admin" : ""}</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">Chat history</p>
            <p className="mt-0.5 font-medium">Saved to your account</p>
            <p className="text-xs text-muted-foreground">Chats sync across your devices.</p>
          </div>
        </div>
        <p className="text-muted-foreground">
          Account details are managed on the{" "}
          <Link href="/account" className="text-primary hover:underline">
            Account page
          </Link>
          . Assistant behaviour lives in Personalization and Model.
        </p>
      </CardContent>
    </Card>
  );
}

function PersonalizationSection({ settings, onSave }: { settings: AiSettings; onSave: (s: AiSettings) => void }) {
  const [nickname, setNickname] = useState(settings.nickname);
  const [tone, setTone] = useState(settings.tone);
  const [instructions, setInstructions] = useState(settings.instructions);
  const dirty = nickname !== settings.nickname || tone !== settings.tone || instructions !== settings.instructions;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-muted-foreground" /> Personalization
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field label="What should the assistant call you?" htmlFor="ai-nickname">
          <Input
            id="ai-nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="e.g. Ben"
            maxLength={100}
          />
        </Field>
        <div>
          <p className="mb-1.5 block text-xs font-label uppercase tracking-[0.08em] text-muted-foreground">Tone</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {AI_TONE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setTone(option.id)}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors",
                  tone === option.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
                )}
              >
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  {option.label}
                  {tone === option.id ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{option.hint}</p>
              </button>
            ))}
          </div>
        </div>
        <Field
          label="Custom instructions"
          htmlFor="ai-instructions"
          hint="Sent with every chat — style rules, context about your work, things to avoid."
        >
          <Textarea
            id="ai-instructions"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={4}
            maxLength={4000}
            placeholder="e.g. Use Australian English. We're a progressive campaigning organisation."
          />
        </Field>
        <div className="flex justify-end">
          <Button disabled={!dirty} onClick={() => onSave({ ...settings, nickname, tone, instructions })}>
            Save changes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ModelSection({ settings, onSave }: { settings: AiSettings; onSave: (s: AiSettings) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-muted-foreground" /> Model
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {AI_MODEL_OPTIONS.map((model) => (
          <button
            key={model.id}
            type="button"
            onClick={() => onSave({ ...settings, model: model.id })}
            className={cn(
              "flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors",
              settings.model === model.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
            )}
          >
            <div>
              <p className="text-sm font-medium">{model.name}</p>
              <p className="text-xs text-muted-foreground">{model.blurb}</p>
            </div>
            {settings.model === model.id ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
          </button>
        ))}
        <p className="pt-1 text-xs text-muted-foreground">Applies to your next message.</p>
      </CardContent>
    </Card>
  );
}

function BillingSection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BadgeDollarSign className="h-4 w-4 text-muted-foreground" /> Credit and Billing <ComingSoon />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { label: "Messages this month", value: "—" },
            { label: "Tokens used", value: "—" },
            { label: "Estimated cost", value: "—" },
          ].map((stat) => (
            <div key={stat.label} className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="mt-0.5 text-lg font-semibold">{stat.value}</p>
            </div>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          Usage metering and per-workspace credits will land here once the assistant opens beyond super admins.
        </p>
      </CardContent>
    </Card>
  );
}

function MemorySection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-muted-foreground" /> Memory <ComingSoon />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          The assistant will be able to remember durable facts between chats — campaign context, style guides,
          recurring audiences. Until then, use Custom instructions in Personalization for anything it should always
          know.
        </p>
        <Button variant="outline" size="sm" disabled>
          Add a memory
        </Button>
      </CardContent>
    </Card>
  );
}

function FilesSection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-muted-foreground" /> File & Media <ComingSoon />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Attach documents, images and spreadsheets to chats — briefs to summarise, data to sense-check, creative to
          critique.
        </p>
        <Button variant="outline" size="sm" disabled>
          Upload a file
        </Button>
      </CardContent>
    </Card>
  );
}

function ConnectorsSection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cable className="h-4 w-4 text-muted-foreground" /> Connector <ComingSoon />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Let the assistant read from your connected tools. Today the platform already integrates Action Network for
          audience sync — assistant access to those sources will be opt-in per connector here.
        </p>
        <div className="rounded-lg border border-border p-3">
          <p className="text-sm font-medium">Action Network</p>
          <p className="text-xs text-muted-foreground">Audience list sync — connected under Data. Assistant access off.</p>
        </div>
      </CardContent>
    </Card>
  );
}

function DataControlsSection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" /> Data Control <ComingSoon />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Chats are stored against your account and never shared with other users. Bulk export and delete-all controls
          land here; for now you can delete individual chats from the history panel.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled>
            Export chat history
          </Button>
          <Button variant="outline" size="sm" disabled>
            Delete all chats
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
