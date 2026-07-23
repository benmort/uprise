'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Building2, Loader2, Trash2 } from 'lucide-react';
import { tenants as tenantsApi, type AuthPrincipal, type TenantRecord, type TenantStatus } from '@uprise/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@uprise/ui';
import { Button } from '@uprise/ui';
import { Input } from '@uprise/ui';
import { Label } from "@uprise/ui";
import { getSession } from '@/lib/session';
import { TenantPageHeader } from '@/components/super/tenant-page-header';

const STATUS_OPTIONS: { value: TenantStatus; label: string }[] = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'ARCHIVED', label: 'Archived' },
];

export default function TenantDetailPage() {
  const params = useParams();
  const router = useRouter();
  const tenantId = params?.tenantId as string;

  const [principal, setPrincipal] = useState<AuthPrincipal | null>(null);
  const [tenant, setTenant] = useState<TenantRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [status, setStatus] = useState<TenantStatus>('ACTIVE');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const isSuperAdmin = principal?.isSuperAdmin === true;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [session, res] = await Promise.all([getSession(), tenantsApi.get(tenantId)]);
    setPrincipal(session);
    if (res.ok) {
      setTenant(res.data);
      setName(res.data.name);
      setSlug(res.data.slug);
      setStatus(res.data.status);
    } else {
      setError(res.error);
    }
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (saving || !tenant) return;
    setSaving(true);
    setActionError(null);
    // Super-admin may re-slug + set the lifecycle status; a customer owner edits the name only.
    const body = isSuperAdmin ? { name, slug, status } : { name };
    const res = await tenantsApi.update(tenant.id, body);
    setSaving(false);
    if (res.ok) {
      setTenant(res.data);
      setName(res.data.name);
      setSlug(res.data.slug);
      setStatus(res.data.status);
    } else {
      setActionError(res.error);
    }
  };

  const remove = async () => {
    if (saving || !tenant) return;
    if (!window.confirm(`Delete tenant "${tenant.name}"?`)) return;
    setSaving(true);
    setActionError(null);
    const res = await tenantsApi.remove(tenant.id);
    setSaving(false);
    if (res.ok) router.push('/super/tenants');
    else setActionError(res.error);
  };

  if (loading) {
    return (
      <div className="page-stack">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading…
        </div>
      </div>
    );
  }

  if (error || !tenant) {
    return (
      <div className="page-stack">
        <TenantPageHeader title="Overview" icon={Building2} />
        <p className="text-sm text-error">{error ?? 'Tenant not found.'}</p>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <TenantPageHeader
        title="Overview"
        icon={Building2}
        description="The tenant's identity, lifecycle status and plan."
        actions={
          isSuperAdmin ? (
            <Button variant="outline" className="text-red-600 dark:text-red-400" onClick={() => void remove()} disabled={saving}>
              <Trash2 className="h-4 w-4 mr-2" /> Delete tenant
            </Button>
          ) : null
        }
      />

      <div className="max-w-2xl space-y-6">
        {actionError ? (
          <div className="rounded-md border border-error/30 bg-error-container/40 px-4 py-3 text-sm text-error">
            {actionError}
          </div>
        ) : null}

        <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" /> Basic Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label variant="form" htmlFor="t-name">Display Name</Label>
              <Input id="t-name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label variant="form" htmlFor="t-status">Status</Label>
              {isSuperAdmin ? (
                <select
                  id="t-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as TenantStatus)}
                  className="mt-1 h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground"
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <Input id="t-status" value={status} readOnly className="mt-1 read-only:bg-gray-50 dark:read-only:bg-gray-900" />
              )}
              {tenant.network?.planName ? (
                <p className="mt-1 text-xs text-muted-foreground">Plan: {tenant.network.planName}</p>
              ) : null}
            </div>
            <div>
              <Label variant="form" htmlFor="t-slug">Subdomain</Label>
              <Input
                id="t-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                readOnly={!isSuperAdmin}
                className="mt-1 read-only:bg-gray-50 dark:read-only:bg-gray-900"
              />
              {!isSuperAdmin ? (
                <p className="text-xs text-gray-500 mt-1">Only a super-admin can change the subdomain.</p>
              ) : null}
            </div>
            <div className="flex justify-end">
              <Button onClick={() => void save()} disabled={saving || !name.trim()}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Save changes
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
