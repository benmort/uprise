'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, AtSign, Copy, Loader2, Plus, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import {
  emailProvisioning,
  tenants as tenantsApi,
  type AuthPrincipal,
  type EmailProvisioningRequest,
  type EmailProvisioningRun,
  type EmailProvisioningStep,
  type EmailSenderIdentity,
  type TenantRecord,
} from '@uprise/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/prog/ui/card';
import { Button } from '@/components/prog/ui/button';
import { Input } from '@/components/prog/ui/input';
import { Label } from '@/components/prog/ui/label';
import { getSession } from '@/lib/session';
import { getFeatureFlags } from '@/lib/api';
import {
  EMAIL_TIMELINE_CURRENT_STEP,
  EMAIL_TIMELINE_STEPS,
  ProvisioningTimeline,
} from '@/components/telephony/provisioning-timeline';

type RunWithSteps = EmailProvisioningRun & { steps: EmailProvisioningStep[] };

const EMPTY_FORM = {
  kind: 'UPRISE_SUBDOMAIN' as 'UPRISE_SUBDOMAIN' | 'CUSTOM_DOMAIN' | 'SINGLE_ADDRESS',
  mode: 'SUBUSER' as 'SUBUSER' | 'BYO',
  slug: '',
  domain: '',
  fromLocalPart: 'hello',
  fromName: '',
  byoApiKey: '',
};

/** DNS records table for custom-domain waits (the tenant adds these records). */
function DnsRecordsTable({ identity }: { identity: EmailSenderIdentity | null }) {
  const records = identity?.dnsRecords ?? [];
  if (!identity || records.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-xs">
        <thead className="bg-surface-variant text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-bold">Type</th>
            <th className="px-3 py-2 font-bold">Host</th>
            <th className="px-3 py-2 font-bold">Value</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={r.host} className="border-t border-border">
              <td className="px-3 py-2 font-mono uppercase">{r.type}</td>
              <td className="max-w-[180px] truncate px-3 py-2 font-mono" title={r.host}>{r.host}</td>
              <td className="max-w-[220px] truncate px-3 py-2 font-mono" title={r.data}>{r.data}</td>
              <td className="px-3 py-2">
                <button
                  type="button"
                  aria-label="Copy record"
                  onClick={() => void navigator.clipboard.writeText(`${r.host} CNAME ${r.data}`)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Super-admin: provision (and manage) a tenant's email sender identities —
 * SendGrid subuser, domain authentication (automated for uprise subdomains via
 * DNSimple; manual DNS for tenant-owned domains) — with the live timeline.
 */
export default function TenantEmailPage() {
  const params = useParams();
  const tenantId = params?.tenantId as string;

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [principal, setPrincipal] = useState<AuthPrincipal | null>(null);
  const [tenant, setTenant] = useState<TenantRecord | null>(null);
  const [runs, setRuns] = useState<EmailProvisioningRun[]>([]);
  const [identities, setIdentities] = useState<EmailSenderIdentity[]>([]);
  const [requests, setRequests] = useState<EmailProvisioningRequest[]>([]);
  // The OPEN request a started run fulfils (set by its "Provision" button).
  const [fulfillingRequestId, setFulfillingRequestId] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<RunWithSteps | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const [flags, session, tenantRes, runsRes, idsRes, reqRes] = await Promise.all([
      getFeatureFlags(),
      getSession(),
      tenantsApi.get(tenantId),
      emailProvisioning.listRuns(tenantId),
      emailProvisioning.listIdentities(tenantId),
      emailProvisioning.listRequests({ tenantId }),
    ]);
    setEnabled(flags.ok ? Boolean(flags.data.FEATURE_TENANT_EMAIL_ENABLED) : false);
    setPrincipal(session);
    if (tenantRes.ok) setTenant(tenantRes.data);
    if (runsRes.ok) setRuns(runsRes.data);
    else setError(runsRes.error);
    if (idsRes.ok) setIdentities(idsRes.data);
    if (reqRes.ok) setRequests(reqRes.data);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Live-ish timeline while a run is in flight.
  useEffect(() => {
    if (!selectedRun || selectedRun.status === 'ACTIVE' || selectedRun.status === 'FAILED') return;
    const t = setInterval(async () => {
      const res = await emailProvisioning.getRun(selectedRun.id);
      if (res.ok) setSelectedRun(res.data);
    }, 5000);
    return () => clearInterval(t);
  }, [selectedRun]);

  const openRun = async (runId: string) => {
    const res = await emailProvisioning.getRun(runId);
    if (res.ok) setSelectedRun(res.data);
    else setActionError(res.error);
  };

  const declineRequest = async (id: string) => {
    const reason = window.prompt("Reason (shown to the tenant owner):") ?? undefined;
    const res = await emailProvisioning.declineRequest(id, reason);
    if (!res.ok) setActionError(res.error);
    await load();
  };

  const startRun = async () => {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    const res = await emailProvisioning.startRun({
      tenantId,
      mode: form.mode,
      kind: form.kind,
      ...(form.kind === 'UPRISE_SUBDOMAIN' && form.slug ? { slug: form.slug } : {}),
      ...(form.kind !== 'UPRISE_SUBDOMAIN' ? { domain: form.domain } : {}),
      fromLocalPart: form.fromLocalPart,
      fromName: form.fromName || tenant?.name || 'Uprise',
      ...(form.mode === 'BYO' ? { byoApiKey: form.byoApiKey } : {}),
      // Fulfils the owner's open setup request atomically with run creation.
      ...(fulfillingRequestId ? { requestId: fulfillingRequestId } : {}),
    });
    setBusy(false);
    if (!res.ok) {
      setActionError(res.error);
      return;
    }
    setShowForm(false);
    setForm(EMPTY_FORM);
    setFulfillingRequestId(null);
    await load();
    await openRun(res.data.id);
  };

  const retry = async (runId: string) => {
    setActionError(null);
    const res = await emailProvisioning.retryRun(runId);
    if (!res.ok) setActionError(res.error);
    await load();
    await openRun(runId);
  };

  const validateNow = async (runId: string) => {
    setActionError(null);
    const res = await emailProvisioning.validateRun(runId);
    if (!res.ok) setActionError(res.error);
    await load();
    await openRun(runId);
  };

  const revoke = async (identityId: string) => {
    if (!window.confirm('Revoke this sender identity? Sends fall back to the platform address.')) return;
    setActionError(null);
    const res = await emailProvisioning.revokeIdentity(identityId);
    if (!res.ok) setActionError(res.error);
    await load();
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (principal && !principal.isSuperAdmin) {
    return <p className="p-6 text-sm text-muted-foreground">Email identity provisioning is managed by the platform team.</p>;
  }
  if (enabled === false) {
    // Deliberately parked: the engine is built and reviewed, but enabling it
    // needs the platform SendGrid account upgraded (subusers are a Pro feature).
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href={`/super/tenants/${tenantId}`}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              {tenant?.name ?? 'Tenant'}
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">Email identities</h1>
          <span className="rounded-full bg-surface-variant px-2.5 py-1 text-xs font-bold uppercase text-muted-foreground">
            Coming soon
          </span>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AtSign className="h-4 w-4" />
              Per-tenant sender identities
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Each organisation will be able to send from its own address — an automated
              <span className="mx-1 font-mono text-foreground">hello@&lt;org&gt;.mail.uprise.org.au</span>
              subdomain (DNS fully automated) or its own domain, with a provisioning timeline just
              like phone numbers. The engine is built and ready behind
              <span className="mx-1 font-mono">FEATURE_TENANT_EMAIL_ENABLED</span>.
            </p>
            <p className="rounded-lg border border-border bg-surface-variant/60 p-3 text-foreground">
              <strong>To switch it on:</strong> upgrade the platform SendGrid account to Pro —
              per-tenant isolation uses SendGrid subusers, which the free tier doesn&rsquo;t include.
              Pro caps subusers at roughly 15; organisations beyond that bring their own SendGrid
              account (already supported).
            </p>
            <p>
              Until then, all email — including every transactional send (verification codes, magic
              links, invitations, receipts) — continues from the platform address
              <span className="ml-1 font-mono text-foreground">info@uprise.org.au</span>, which is
              unaffected by this feature either way.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const set = (key: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const previewDomain =
    form.kind === 'UPRISE_SUBDOMAIN'
      ? `${form.slug || tenant?.slug || 'tenant'}.mail.uprise.org.au`
      : form.domain || 'example.org.au';
  const selectedIdentity =
    (selectedRun?.identityId && identities.find((i) => i.id === selectedRun.identityId)) || null;
  const showDnsTable =
    selectedRun &&
    selectedIdentity?.kind === 'CUSTOM_DOMAIN' &&
    (selectedRun.status === 'DNS_CONFIGURED' || selectedRun.status === 'VALIDATION_FAILED');

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/super/tenants/${tenantId}`}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            {tenant?.name ?? 'Tenant'}
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">Email identities</h1>
      </div>

      {error ? <p className="text-sm text-error">{error}</p> : null}
      {actionError ? <p className="text-sm text-error">{actionError}</p> : null}

      {/* Owner setup requests — the queue this console exists to serve. "Provision" opens the
          run form bound to the request (fulfilled atomically with run creation); Decline
          resolves it with a reason the owner sees. */}
      {requests.filter((r) => r.status === 'OPEN').length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AtSign className="h-4 w-4" />
              Open setup requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {requests
                .filter((r) => r.status === 'OPEN')
                .map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">
                        {r.kind ?? 'Any identity'}
                        {r.domain ? <span className="ml-2 font-mono text-xs">{r.domain}</span> : null}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Requested {new Date(r.createdAt).toLocaleString('en-AU')}
                        {r.notes ? ` — “${r.notes}”` : ''}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => {
                        setFulfillingRequestId(r.id);
                        setShowForm(true);
                      }}
                    >
                      Provision
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void declineRequest(r.id)}
                    >
                      Decline
                    </Button>
                  </li>
                ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <AtSign className="h-4 w-4" />
                Sender identities
              </CardTitle>
              <Button size="sm" onClick={() => setShowForm((v) => !v)}>
                <Plus className="mr-1 h-4 w-4" />
                Provision an identity
              </Button>
            </CardHeader>
            <CardContent>
              {identities.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sender identities yet — provision the first one.</p>
              ) : (
                <ul className="space-y-2">
                  {identities.map((i) => (
                    <li key={i.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                      <span className="truncate font-mono text-sm font-semibold">{i.fromEmail}</span>
                      <span className="rounded-full bg-surface-variant px-2 py-0.5 text-xs font-bold uppercase text-muted-foreground">
                        {i.status}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {i.campaignId ? 'campaign-scoped' : i.purpose === 'transactional' ? 'transactional' : 'tenant default'}
                      </span>
                      {i.status !== 'REVOKED' ? (
                        <button
                          type="button"
                          aria-label="Revoke identity"
                          onClick={() => revoke(i.id)}
                          className="ml-auto text-muted-foreground hover:text-error"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {showForm ? (
            <Card>
              <CardHeader>
                <CardTitle>Provision a sender identity</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  {(
                    [
                      ['UPRISE_SUBDOMAIN', 'uprise subdomain (automated)'],
                      ['CUSTOM_DOMAIN', 'tenant-owned domain'],
                      ['SINGLE_ADDRESS', 'verified single address'],
                    ] as const
                  ).map(([kind, label]) => (
                    <label key={kind} className="flex items-center gap-2 text-sm">
                      <input type="radio" checked={form.kind === kind} onChange={() => setForm((f) => ({ ...f, kind }))} />
                      {label}
                    </label>
                  ))}
                </div>
                <p className="rounded-lg bg-surface-variant px-3 py-2 font-mono text-xs text-muted-foreground">
                  {form.fromLocalPart || 'hello'}@{previewDomain}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {form.kind === 'UPRISE_SUBDOMAIN' ? (
                    <div>
                      <Label htmlFor="slug">Subdomain label</Label>
                      <Input id="slug" placeholder={tenant?.slug ?? 'tenant-slug'} value={form.slug} onChange={set('slug')} />
                    </div>
                  ) : (
                    <div>
                      <Label htmlFor="domain">Domain</Label>
                      <Input id="domain" placeholder="tenantparty.org.au" value={form.domain} onChange={set('domain')} />
                    </div>
                  )}
                  <div>
                    <Label htmlFor="fromLocalPart">From (local part)</Label>
                    <Input id="fromLocalPart" value={form.fromLocalPart} onChange={set('fromLocalPart')} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="fromName">From name</Label>
                    <Input id="fromName" placeholder={tenant?.name ?? 'Display name'} value={form.fromName} onChange={set('fromName')} />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" checked={form.mode === 'SUBUSER'} onChange={() => setForm((f) => ({ ...f, mode: 'SUBUSER' }))} />
                    Managed subuser
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" checked={form.mode === 'BYO'} onChange={() => setForm((f) => ({ ...f, mode: 'BYO' }))} />
                    Bring-your-own SendGrid
                  </label>
                </div>
                {form.mode === 'BYO' ? (
                  <div>
                    <Label htmlFor="byoKey">SendGrid API key</Label>
                    <Input id="byoKey" type="password" value={form.byoApiKey} onChange={set('byoApiKey')} />
                  </div>
                ) : null}
                <Button
                  onClick={startRun}
                  disabled={busy || !form.fromLocalPart || (form.kind !== 'UPRISE_SUBDOMAIN' && !form.domain)}
                >
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Start provisioning
                </Button>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Provisioning runs</CardTitle>
            </CardHeader>
            <CardContent>
              {runs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No runs yet.</p>
              ) : (
                <ul className="space-y-2">
                  {runs.map((run) => (
                    <li key={run.id}>
                      <button
                        type="button"
                        onClick={() => openRun(run.id)}
                        className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left hover:bg-surface-variant"
                      >
                        <span className="text-sm font-semibold">
                          {String(run.input?.kind ?? 'identity').replaceAll('_', ' ').toLowerCase()}
                        </span>
                        <span className="rounded-full bg-surface-variant px-2 py-0.5 text-xs font-bold uppercase text-muted-foreground">
                          {run.status.replaceAll('_', ' ')}
                        </span>
                        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                          {new Date(run.createdAt).toLocaleDateString()}
                        </span>
                        {run.status === 'FAILED' ? (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              void retry(run.id);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.stopPropagation();
                                void retry(run.id);
                              }
                            }}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-500 hover:underline"
                          >
                            <RotateCcw className="h-3 w-3" />
                            Retry
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Timeline</CardTitle>
            {selectedRun && (selectedRun.status === 'DNS_CONFIGURED' || selectedRun.status === 'VALIDATION_FAILED') ? (
              <Button size="sm" variant="outline" onClick={() => void validateNow(selectedRun.id)}>
                <RefreshCw className="mr-1 h-3.5 w-3.5" />
                Validate now
              </Button>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedRun ? (
              <>
                {showDnsTable ? (
                  <>
                    <p className="text-xs text-muted-foreground">
                      The tenant adds these CNAME records to their DNS, then validation confirms them.
                    </p>
                    <DnsRecordsTable identity={selectedIdentity} />
                  </>
                ) : null}
                <ProvisioningTimeline
                  run={selectedRun}
                  steps={selectedRun.steps}
                  stepDefs={EMAIL_TIMELINE_STEPS}
                  currentStepByStatus={EMAIL_TIMELINE_CURRENT_STEP}
                />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Select a provisioning run to see its timeline.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
