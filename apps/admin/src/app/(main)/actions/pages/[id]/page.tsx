"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { Copy as CopyIcon, ExternalLink, Megaphone } from "lucide-react";
import { actionPages, autodialer, type AuthPrincipal } from "@uprise/api-client";
import type { ActionPageRecord, ActionPageSessionRow } from "@uprise/contracts";
import { getSession } from "@/lib/session";
import { useApi, invalidateApi } from "@/lib/use-api";
import { behaviourOf } from "@/components/autodialer/behaviour";
import { PageShell } from "@/components/shell/page-shell";
import { StateRegion } from "@/components/shell/state-region";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DataTable, KpiTile } from "@uprise/field";
import { ConfirmDialog, Field, SegmentedControl, Select, SelectItem, Switch, TagChip } from "@uprise/ui";
import { useToast } from "@/components/ui/toast";

type Tab = "build" | "embed" | "results";

const ACTION_APP_URL = process.env.NEXT_PUBLIC_ACTION_APP_URL || "http://localhost:3004";

/** Same hostname / *.wildcard grammar the API enforces at write time. */
const DOMAIN_RE = /^(\*\.)?[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;

function tenantSlugOf(principal: AuthPrincipal | null): string | null {
  if (!principal) return null;
  if (principal.activeTenant?.slug) return principal.activeTenant.slug;
  const membership = principal.memberships.find((m) => m.tenantId === principal.tenantId);
  return membership?.tenantSlug ?? null;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

/**
 * The action-page builder: Build (copy, campaign, fields, embed allowlist,
 * publish) | Embed (both snippet forms + live preview) | Results. The live
 * preview frames the REAL public route — drafts via a short-lived preview
 * token, so what you see is literally what ships.
 */
export default function ActionPageBuilderPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const tab = ((): Tab => {
    const t = searchParams.get("tab");
    return t === "embed" || t === "results" ? t : "build";
  })();

  const detail = useApi(`/actions/pages/${id}`, () => actionPages.get(id));
  const campaigns = useApi("/autodialer/campaigns|page-builder", () => autodialer.list({ limit: 100 }), {
    ttlMs: 30_000,
  });
  const [principal, setPrincipal] = useState<AuthPrincipal | null>(null);
  useEffect(() => {
    void getSession().then(setPrincipal);
  }, []);

  const page = detail.data;
  const tenantSlug = tenantSlugOf(principal);
  const publicPath = page && tenantSlug ? `/${tenantSlug}/actions/${page.publicSlug}` : null;
  const publicUrl = publicPath ? `${ACTION_APP_URL}${publicPath}` : null;

  const setTab = (next: Tab) =>
    router.replace(next === "build" ? pathname : `${pathname}?tab=${next}`, { scroll: false });

  const refresh = () => {
    invalidateApi(`/actions/pages/${id}`);
    void detail.refetch();
  };

  return (
    <PageShell
      icon={Megaphone}
      title={page?.title ?? "Action page"}
      actions={page ? <StatusBadge status={page.status} /> : null}
      backHref="/actions/pages"
      backLabel="Pages"
    >
      <StateRegion
        loading={detail.loading}
        error={detail.error}
        noPermission={detail.noPermission}
        onRetry={() => void detail.refetch()}
        empty={false}
        skeleton={<Skeleton className="h-96 w-full" />}
      >
        {page ? (
          <div className="space-y-4">
            <SegmentedControl
              value={tab}
              options={[
                { value: "build", label: "Build" },
                { value: "embed", label: "Embed" },
                { value: "results", label: "Results" },
              ]}
              onChange={setTab}
              aria-label="Page tabs"
            />
            {tab === "build" ? (
              <BuildTab
                page={page}
                campaigns={campaigns.data?.campaigns ?? []}
                publicUrl={publicUrl}
                onChanged={refresh}
                showToast={showToast}
              />
            ) : null}
            {tab === "embed" ? (
              <EmbedTab page={page} tenantSlug={tenantSlug} showToast={showToast} />
            ) : null}
            {tab === "results" ? <ResultsTab pageId={id} /> : null}
          </div>
        ) : null}
      </StateRegion>
    </PageShell>
  );
}

/* ────────────────────────────── Build ───────────────────────────── */

function BuildTab({
  page,
  campaigns,
  publicUrl,
  onChanged,
  showToast,
}: {
  page: ActionPageRecord;
  campaigns: Array<{
    id: string;
    name: string;
    status: string;
    survey: boolean;
    electoralTarget: boolean;
    transparentTargetTransfer: boolean;
  }>;
  publicUrl: string | null;
  onChanged: () => void;
  showToast: ReturnType<typeof useToast>["showToast"];
}) {
  const [title, setTitle] = useState(page.title);
  const [headline, setHeadline] = useState(page.headline ?? "");
  const [body, setBody] = useState(page.body ?? "");
  const [ctaLabel, setCtaLabel] = useState(page.ctaLabel ?? "");
  const [successMessage, setSuccessMessage] = useState(page.successMessage ?? "");
  const [campaignId, setCampaignId] = useState(page.campaignId ?? "");
  const [collectName, setCollectName] = useState(page.collectName);
  const [collectEmail, setCollectEmail] = useState(page.collectEmail);
  const [collectPhone, setCollectPhone] = useState(page.collectPhone);
  const [allowPrefill, setAllowPrefill] = useState(page.allowPrefill);
  const [requireCaptcha, setRequireCaptcha] = useState(page.requireCaptcha);
  const [domains, setDomains] = useState<string[]>(page.embedDomains);
  const [domainDraft, setDomainDraft] = useState("");
  const [domainError, setDomainError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [previewToken, setPreviewToken] = useState<string | null>(null);

  // Draft preview needs the short-lived token; published pages are just public.
  useEffect(() => {
    if (page.status !== "DRAFT") {
      setPreviewToken(null);
      return;
    }
    let cancelled = false;
    void actionPages.previewToken(page.id).then((res) => {
      if (!cancelled && res.ok) setPreviewToken(res.data.token);
    });
    return () => {
      cancelled = true;
    };
  }, [page.id, page.status]);

  // Click-to-call pages ride TRANSFER/ELECTORAL campaigns.
  const callable = campaigns.filter((c) => c.transparentTargetTransfer || c.electoralTarget);

  const addDomain = () => {
    const value = domainDraft.trim().toLowerCase();
    if (!value) return;
    if (!DOMAIN_RE.test(value)) {
      setDomainError("Use a bare hostname (example.org) or a *.wildcard (*.example.org).");
      return;
    }
    setDomainError(null);
    if (!domains.includes(value)) setDomains([...domains, value]);
    setDomainDraft("");
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    const res = await actionPages.update(page.id, {
      title: title.trim() || page.title,
      headline: headline.trim() || null,
      body: body.trim() || null,
      ctaLabel: ctaLabel.trim() || null,
      successMessage: successMessage.trim() || null,
      campaignId: campaignId || null,
      collectName,
      collectEmail,
      collectPhone,
      allowPrefill,
      requireCaptcha,
      embedDomains: domains,
    });
    setSaving(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Save failed", description: res.error });
      return;
    }
    showToast({ tone: "success", title: "Page saved" });
    onChanged();
  };

  const runLifecycle = async (
    key: string,
    action: () => ReturnType<typeof actionPages.publish>,
    doneTitle: string,
  ) => {
    if (busyAction) return;
    setBusyAction(key);
    const res = await action();
    setBusyAction(null);
    if (!res.ok) {
      showToast({ tone: "error", title: `${doneTitle} failed`, description: res.error });
      return;
    }
    showToast({ tone: "success", title: doneTitle });
    onChanged();
  };

  const previewSrc = publicUrl
    ? `${publicUrl}${previewToken ? `?previewToken=${encodeURIComponent(previewToken)}` : ""}`
    : null;

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr,420px]">
      <div className="space-y-4">
        <ConfirmDialog
          open={confirmArchive}
          title="Archive this page?"
          description="The public URL stops resolving; results are kept. You can restore it later."
          confirmLabel="Archive"
          busy={busyAction === "archive"}
          onCancel={() => setConfirmArchive(false)}
          onConfirm={() =>
            void runLifecycle("archive", () => actionPages.archive(page.id), "Page archived").then(() =>
              setConfirmArchive(false),
            )
          }
        />

        <Card className="space-y-3 p-4">
          <h3 className="text-sm font-semibold">Content</h3>
          <Field label="Internal title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Headline" hint="The public page's heading.">
            <Input value={headline} onChange={(e) => setHeadline(e.target.value)} />
          </Field>
          <Field label="Body">
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Button label">
              <Input value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} placeholder="Call now" />
            </Field>
            <Field label="Success message">
              <Input
                value={successMessage}
                onChange={(e) => setSuccessMessage(e.target.value)}
                placeholder="Thanks for calling!"
              />
            </Field>
          </div>
        </Card>

        <Card className="space-y-3 p-4">
          <h3 className="text-sm font-semibold">Calling campaign</h3>
          <p className="text-xs text-muted-foreground">
            The autodialer campaign that owns the telephony — targets, caller ID, compliance.
            Transfer and electoral-target campaigns can take widget calls.
          </p>
          <Select
            value={campaignId || "none"}
            onValueChange={(v) => setCampaignId(v === "none" ? "" : v)}
            className="w-full"
            aria-label="Campaign"
          >
            <SelectItem value="none">Choose a campaign…</SelectItem>
            {callable.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name} — {behaviourOf(c).label} ({c.status.toLowerCase()})
              </SelectItem>
            ))}
          </Select>
        </Card>

        <Card className="space-y-3 p-4">
          <h3 className="text-sm font-semibold">Supporter fields</h3>
          {(
            [
              ["Ask for a name", collectName, setCollectName],
              ["Ask for an email", collectEmail, setCollectEmail],
              ["Ask for a mobile", collectPhone, setCollectPhone],
              ["Allow host-page prefill", allowPrefill, setAllowPrefill],
              ["Require captcha", requireCaptcha, setRequireCaptcha],
            ] as Array<[string, boolean, (v: boolean) => void]>
          ).map(([label, value, setter]) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-sm">{label}</span>
              <Switch checked={value} onCheckedChange={setter} />
            </div>
          ))}
        </Card>

        <Card className="space-y-3 p-4">
          <h3 className="text-sm font-semibold">Embedding allowlist</h3>
          <p className="text-xs text-muted-foreground">
            Empty = the widget embeds anywhere. Add hostnames to lock framing down to those sites
            (enforced by the embed route's CSP).
          </p>
          <div className="flex flex-wrap gap-1.5">
            {domains.map((domain) => (
              <TagChip key={domain} label={`${domain} ×`} onClick={() => setDomains(domains.filter((d) => d !== domain))} />
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={domainDraft}
              onChange={(e) => setDomainDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addDomain();
                }
              }}
              placeholder="example.org or *.example.org"
              className="font-mono text-sm"
            />
            <Button variant="outline" onClick={addDomain}>
              Add
            </Button>
          </div>
          {domainError ? <p className="text-xs text-error">{domainError}</p> : null}
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            {page.status === "DRAFT" ? (
              <Button
                variant="outline"
                disabled={busyAction !== null}
                onClick={() => void runLifecycle("publish", () => actionPages.publish(page.id), "Page published")}
              >
                Publish
              </Button>
            ) : null}
            {page.status === "PUBLISHED" ? (
              <Button
                variant="outline"
                disabled={busyAction !== null}
                onClick={() =>
                  void runLifecycle("unpublish", () => actionPages.unpublish(page.id), "Page unpublished")
                }
              >
                Unpublish
              </Button>
            ) : null}
            {page.status !== "ARCHIVED" ? (
              <Button variant="ghost" disabled={busyAction !== null} onClick={() => setConfirmArchive(true)}>
                Archive
              </Button>
            ) : (
              <Button
                variant="outline"
                disabled={busyAction !== null}
                onClick={() => void runLifecycle("restore", () => actionPages.restore(page.id), "Page restored")}
              >
                Restore
              </Button>
            )}
          </div>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save page"}
          </Button>
        </div>
      </div>

      {/* Live preview — the REAL public route in a sandboxed frame. */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Live preview</h3>
          {previewSrc ? (
            <a
              href={previewSrc}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary"
            >
              Open <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          ) : null}
        </div>
        {previewSrc ? (
          <iframe
            src={previewSrc}
            title="Page preview"
            sandbox="allow-scripts allow-same-origin allow-forms"
            className="h-[560px] w-full rounded-xl border border-border bg-surface"
          />
        ) : (
          <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
            Preview loads once the workspace slug resolves.
          </p>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────── Embed ───────────────────────────── */

function EmbedTab({
  page,
  tenantSlug,
  showToast,
}: {
  page: ActionPageRecord;
  tenantSlug: string | null;
  showToast: ReturnType<typeof useToast>["showToast"];
}) {
  const [form, setForm] = useState<"script" | "iframe">("script");
  const org = tenantSlug ?? "your-workspace";
  const scriptSnippet = `<script async src="${ACTION_APP_URL}/embed/v1/uprise-action.js"></script>\n<uprise-action org="${org}" page="${page.publicSlug}"></uprise-action>`;
  const iframeSnippet = `<iframe\n  src="${ACTION_APP_URL}/${org}/actions/${page.publicSlug}/embed"\n  title="${page.headline ?? "Take action"}"\n  style="border:0;width:100%;max-width:480px;height:480px"\n  allow="microphone ${ACTION_APP_URL}"\n></iframe>`;
  const snippet = form === "script" ? scriptSnippet : iframeSnippet;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      showToast({ tone: "success", title: "Snippet copied" });
    } catch {
      showToast({ tone: "error", title: "Couldn't copy — select the code and copy manually." });
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr,420px]">
      <div className="space-y-3">
        <SegmentedControl
          value={form}
          options={[
            { value: "script", label: "Script tag (recommended)" },
            { value: "iframe", label: "Plain iframe" },
          ]}
          onChange={setForm}
          aria-label="Embed form"
        />
        <Card className="space-y-3 p-4">
          <pre className="overflow-x-auto rounded-lg bg-surface-variant p-3 text-xs leading-relaxed">
            <code>{snippet}</code>
          </pre>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {form === "script"
                ? "The script tag auto-sizes the widget and re-dispatches call events on the element."
                : "The plain iframe is fixed-height; the script tag is easier for most sites."}
            </p>
            <Button size="sm" variant="outline" onClick={() => void copy()}>
              <CopyIcon className="mr-1.5 h-4 w-4" /> Copy
            </Button>
          </div>
        </Card>
        <p className="text-xs text-muted-foreground">
          Browser calls need the microphone, so the embed carries{" "}
          <code className="rounded bg-surface-variant px-1">allow=&quot;microphone&quot;</code> — hosts that strip it
          get a link to open the full page instead.
          {page.embedDomains.length > 0
            ? ` Framing is limited to: ${page.embedDomains.join(", ")}.`
            : " Framing is currently allowed on any site."}
        </p>
      </div>
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Embedded preview</h3>
        {tenantSlug ? (
          <iframe
            src={`${ACTION_APP_URL}/${tenantSlug}/actions/${page.publicSlug}/embed`}
            title="Embed preview"
            sandbox="allow-scripts allow-same-origin allow-forms"
            className="h-[480px] w-full max-w-[480px] rounded-xl border border-border bg-surface"
          />
        ) : (
          <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
            Preview loads once the workspace slug resolves.
          </p>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────── Results ───────────────────────────── */

function ResultsTab({ pageId }: { pageId: string }) {
  const results = useApi(`/actions/pages/${pageId}/results`, () => actionPages.results(pageId, { limit: 50 }), {
    refetchInterval: 15_000,
  });
  const data = results.data;
  const kpi = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString());

  return (
    <StateRegion
      loading={results.loading}
      error={results.error}
      noPermission={results.noPermission}
      onRetry={() => void results.refetch()}
      empty={false}
      skeleton={<Skeleton className="h-64 w-full" />}
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiTile label="Sessions" value={kpi(data?.stats.started)} />
          <KpiTile label="Connected" value={kpi(data?.stats.connected)} />
          <KpiTile label="Bridged to target" value={kpi(data?.stats.bridged)} />
          <KpiTile
            label="Avg duration"
            value={
              data?.stats.averageDurationSeconds == null
                ? "—"
                : `${Math.round(data.stats.averageDurationSeconds / 60)}m ${data.stats.averageDurationSeconds % 60}s`
            }
          />
        </div>
        {data && data.sessions.length > 0 ? (
          <DataTable
            rows={data.sessions}
            rowKey={(s: ActionPageSessionRow) => s.id}
            empty="No sessions."
            pageSize={0}
            columns={[
              {
                key: "supporter",
                header: "Supporter",
                cell: (s: ActionPageSessionRow) => (
                  <span>{s.supporterName ?? s.supporterEmail ?? "Anonymous"}</span>
                ),
              },
              { key: "status", header: "Status", cell: (s: ActionPageSessionRow) => <StatusBadge status={s.status} /> },
              {
                key: "target",
                header: "Target",
                cell: (s: ActionPageSessionRow) => <span className="text-muted-foreground">{s.targetName ?? "—"}</span>,
              },
              {
                key: "source",
                header: "Embedded on",
                cell: (s: ActionPageSessionRow) => (
                  <span className="font-mono text-xs text-muted-foreground">{s.embedAncestor ?? "action site"}</span>
                ),
              },
              {
                key: "created",
                header: "Started",
                cell: (s: ActionPageSessionRow) => (
                  <span className="text-muted-foreground">{formatDate(s.createdAt)}</span>
                ),
              },
            ]}
          />
        ) : (
          <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
            No call sessions yet — publish the page and share it.
          </p>
        )}
      </div>
    </StateRegion>
  );
}
