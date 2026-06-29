'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Building2, Users, ArrowLeft, Loader2, Trash2 } from 'lucide-react';
import { tenants as tenantsApi, type AuthPrincipal, type TenantRecord } from '@uprise/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/prog/ui/card';
import { Button } from '@/components/prog/ui/button';
import { Input } from '@/components/prog/ui/input';
import { Label } from '@/components/prog/ui/label';
import { getSession } from '@/lib/session';

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
    // Super-admin may re-slug; a customer owner edits the name only.
    const body = isSuperAdmin ? { name, slug } : { name };
    const res = await tenantsApi.update(tenant.id, body);
    setSaving(false);
    if (res.ok) {
      setTenant(res.data);
      setName(res.data.name);
      setSlug(res.data.slug);
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
    if (res.ok) router.push('/prog/tenants');
    else setActionError(res.error);
  };

  if (loading) {
    return (
      <section className="page-stack">
        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading…
        </div>
      </section>
    );
  }

  if (error || !tenant) {
    return (
      <section className="page-stack">
        <p className="text-red-600 dark:text-red-400">{error ?? 'Tenant not found.'}</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/prog/tenants')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Tenants
        </Button>
      </section>
    );
  }

  return (
    <section className="page-stack">
      <div className="space-y-6 max-w-2xl">
        <Button variant="ghost" size="sm" onClick={() => router.push('/prog/tenants')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{tenant.name}</h1>
          <p className="text-gray-600 dark:text-gray-400">Tenant details</p>
        </div>

        {actionError ? (
          <div className="rounded-md border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/15 px-4 py-3 text-sm text-red-800 dark:text-red-400">
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
              <Label htmlFor="t-name">Display Name</Label>
              <Input id="t-name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="t-slug">Subdomain</Label>
              <Input
                id="t-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                readOnly={!isSuperAdmin}
                className="mt-1 read-only:bg-gray-50 dark:read-only:bg-gray-900"
              />
              {!isSuperAdmin ? (
                <p className="text-xs text-gray-500 mt-1">
                  Only a super-admin can change the subdomain.
                </p>
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

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => router.push(`/prog/tenants/${tenantId}/members`)}>
            <Users className="h-4 w-4 mr-2" /> Manage Members
          </Button>
          {isSuperAdmin ? (
            <Button variant="outline" className="text-red-600 dark:text-red-400" onClick={() => void remove()} disabled={saving}>
              <Trash2 className="h-4 w-4 mr-2" /> Delete tenant
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
