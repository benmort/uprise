'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Loader2, Phone, Plus, RotateCcw, Trash2, Upload } from 'lucide-react';
import {
  telephony,
  tenants as tenantsApi,
  type AuthPrincipal,
  type TelephonyComplianceInput,
  type TelephonyPhoneNumber,
  type TelephonyProvisioningRun,
  type TelephonyProvisioningStep,
  type TenantRecord,
} from '@uprise/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/prog/ui/card';
import { Button } from '@/components/prog/ui/button';
import { Input } from '@/components/prog/ui/input';
import { Label } from '@/components/prog/ui/label';
import { getSession } from '@/lib/session';
import { getFeatureFlags } from '@/lib/api';
import { ProvisioningTimeline } from '@/components/telephony/provisioning-timeline';

type RunWithSteps = TelephonyProvisioningRun & { steps: TelephonyProvisioningStep[] };

const EMPTY_FORM = {
  legalName: '',
  contactFirstName: '',
  contactLastName: '',
  email: '',
  businessNumber: '',
  street: '',
  city: '',
  region: '',
  postalCode: '',
  mode: 'SUBACCOUNT' as 'SUBACCOUNT' | 'BYO',
  byoAccountSid: '',
  byoAuthToken: '',
};

/**
 * Super-admin: provision (and manage) a tenant's own AU mobile number —
 * subaccount, automated regulatory compliance, purchase, webhooks — with the
 * live step timeline. Owners see the same timeline read-only in tenant settings.
 */
export default function TenantTelephonyPage() {
  const params = useParams();
  const tenantId = params?.tenantId as string;

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [principal, setPrincipal] = useState<AuthPrincipal | null>(null);
  const [tenant, setTenant] = useState<TenantRecord | null>(null);
  const [runs, setRuns] = useState<TelephonyProvisioningRun[]>([]);
  const [numbers, setNumbers] = useState<TelephonyPhoneNumber[]>([]);
  const [selectedRun, setSelectedRun] = useState<RunWithSteps | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [document, setDocument] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const [flags, session, tenantRes, runsRes, numbersRes] = await Promise.all([
      getFeatureFlags(),
      getSession(),
      tenantsApi.get(tenantId),
      telephony.listRuns(tenantId),
      telephony.listNumbers(tenantId),
    ]);
    setEnabled(flags.ok ? Boolean(flags.data.FEATURE_TENANT_TELEPHONY_ENABLED) : false);
    setPrincipal(session);
    if (tenantRes.ok) setTenant(tenantRes.data);
    if (runsRes.ok) setRuns(runsRes.data);
    else setError(runsRes.error);
    if (numbersRes.ok) setNumbers(numbersRes.data);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Live-ish timeline: refresh the open run while it's in flight.
  useEffect(() => {
    if (!selectedRun || selectedRun.status === 'ACTIVE' || selectedRun.status === 'FAILED') return;
    const t = setInterval(async () => {
      const res = await telephony.getRun(selectedRun.id);
      if (res.ok) setSelectedRun(res.data);
    }, 5000);
    return () => clearInterval(t);
  }, [selectedRun]);

  const openRun = async (runId: string) => {
    const res = await telephony.getRun(runId);
    if (res.ok) setSelectedRun(res.data);
    else setActionError(res.error);
  };

  const startRun = async () => {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    const complianceInput: TelephonyComplianceInput = {
      legalName: form.legalName,
      contactFirstName: form.contactFirstName,
      contactLastName: form.contactLastName,
      email: form.email,
      ...(form.businessNumber ? { businessNumber: form.businessNumber } : {}),
      address: { street: form.street, city: form.city, region: form.region, postalCode: form.postalCode },
    };
    const res = await telephony.startRun({
      tenantId,
      mode: form.mode,
      ...(form.mode === 'BYO' ? { byoAccountSid: form.byoAccountSid, byoAuthToken: form.byoAuthToken } : {}),
      complianceInput,
    });
    if (!res.ok) {
      setActionError(res.error);
      setBusy(false);
      return;
    }
    if (document) {
      const up = await telephony.uploadDocument(res.data.id, document, 'business_registration');
      if (!up.ok) setActionError(`Run started, but the document upload failed: ${up.error}`);
    }
    setBusy(false);
    setShowForm(false);
    setForm(EMPTY_FORM);
    setDocument(null);
    await load();
    await openRun(res.data.id);
  };

  const retry = async (runId: string) => {
    setActionError(null);
    const res = await telephony.retryRun(runId);
    if (!res.ok) setActionError(res.error);
    await load();
    await openRun(runId);
  };

  const release = async (numberId: string) => {
    if (!window.confirm('Release this number back to Twilio? Inbound texts to it will stop working.')) return;
    setActionError(null);
    const res = await telephony.releaseNumber(numberId);
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
    return <p className="p-6 text-sm text-muted-foreground">Telephony provisioning is managed by the platform team.</p>;
  }
  if (enabled === false) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        Per-tenant telephony is not enabled (FEATURE_TENANT_TELEPHONY_ENABLED).
      </p>
    );
  }

  const set = (key: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/future/tenants/${tenantId}`}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            {tenant?.name ?? 'Workspace'}
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">Telephony</h1>
      </div>

      {error ? <p className="text-sm text-error">{error}</p> : null}
      {actionError ? <p className="text-sm text-error">{actionError}</p> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                Numbers
              </CardTitle>
              <Button size="sm" onClick={() => setShowForm((v) => !v)}>
                <Plus className="mr-1 h-4 w-4" />
                Provision a number
              </Button>
            </CardHeader>
            <CardContent>
              {numbers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No numbers yet — provision the first one.</p>
              ) : (
                <ul className="space-y-2">
                  {numbers.map((n) => (
                    <li key={n.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                      <span className="font-mono text-sm font-semibold">{n.phoneNumberE164}</span>
                      <span className="rounded-full bg-surface-variant px-2 py-0.5 text-xs font-bold uppercase text-muted-foreground">
                        {n.status}
                      </span>
                      {n.campaignId ? (
                        <span className="text-xs text-muted-foreground">campaign-scoped</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">tenant default</span>
                      )}
                      {n.status !== 'RELEASED' ? (
                        <button
                          type="button"
                          aria-label="Release number"
                          onClick={() => release(n.id)}
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
                <CardTitle>Provision an AU mobile number</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Creates a Twilio subaccount for this tenant, submits the AU regulatory bundle, and
                  purchases a mobile number automatically once approved. The owner can follow the same
                  timeline from their settings.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="legalName">Legal entity name</Label>
                    <Input id="legalName" value={form.legalName} onChange={set('legalName')} />
                  </div>
                  <div>
                    <Label htmlFor="businessNumber">ABN / ACN</Label>
                    <Input id="businessNumber" value={form.businessNumber} onChange={set('businessNumber')} />
                  </div>
                  <div>
                    <Label htmlFor="contactFirstName">Contact first name</Label>
                    <Input id="contactFirstName" value={form.contactFirstName} onChange={set('contactFirstName')} />
                  </div>
                  <div>
                    <Label htmlFor="contactLastName">Contact last name</Label>
                    <Input id="contactLastName" value={form.contactLastName} onChange={set('contactLastName')} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="email">Compliance contact email</Label>
                    <Input id="email" type="email" value={form.email} onChange={set('email')} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="street">Street address</Label>
                    <Input id="street" value={form.street} onChange={set('street')} />
                  </div>
                  <div>
                    <Label htmlFor="city">City / suburb</Label>
                    <Input id="city" value={form.city} onChange={set('city')} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="region">State</Label>
                      <Input id="region" placeholder="NSW" value={form.region} onChange={set('region')} />
                    </div>
                    <div>
                      <Label htmlFor="postalCode">Postcode</Label>
                      <Input id="postalCode" value={form.postalCode} onChange={set('postalCode')} />
                    </div>
                  </div>
                </div>
                <div>
                  <Label htmlFor="doc" className="flex items-center gap-1.5">
                    <Upload className="h-3.5 w-3.5" />
                    Business registration document (PDF)
                  </Label>
                  <input
                    id="doc"
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    className="mt-1 block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-semibold"
                    onChange={(e) => setDocument(e.target.files?.[0] ?? null)}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      checked={form.mode === 'SUBACCOUNT'}
                      onChange={() => setForm((f) => ({ ...f, mode: 'SUBACCOUNT' }))}
                    />
                    Managed subaccount
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      checked={form.mode === 'BYO'}
                      onChange={() => setForm((f) => ({ ...f, mode: 'BYO' }))}
                    />
                    Bring-your-own Twilio account
                  </label>
                </div>
                {form.mode === 'BYO' ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="byoSid">Account SID</Label>
                      <Input id="byoSid" value={form.byoAccountSid} onChange={set('byoAccountSid')} />
                    </div>
                    <div>
                      <Label htmlFor="byoToken">Auth token</Label>
                      <Input id="byoToken" type="password" value={form.byoAuthToken} onChange={set('byoAuthToken')} />
                    </div>
                  </div>
                ) : null}
                <Button onClick={startRun} disabled={busy || !form.legalName || !form.email || !form.street}>
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
                          {run.campaignId ? 'Campaign number' : 'Workspace number'}
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
          <CardHeader>
            <CardTitle>Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedRun ? (
              <ProvisioningTimeline run={selectedRun} steps={selectedRun.steps} />
            ) : (
              <p className="text-sm text-muted-foreground">Select a provisioning run to see its timeline.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
