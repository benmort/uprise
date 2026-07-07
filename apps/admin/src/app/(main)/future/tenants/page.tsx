'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2,
  Plus,
  ShieldCheck,
  Users,
  Settings,
  ShieldAlert,
  Loader2,
  Trash2,
  ArrowRightLeft,
} from 'lucide-react';
import { auth, tenants as tenantsApi, type AuthPrincipal } from '@uprise/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/prog/ui/card';
import { Button } from '@/components/prog/ui/button';
import { Badge } from '@/components/prog/ui/badge';
import { SearchInput } from '@/components/ui/search-input';
import { useFlag } from '@/components/flags/flags-provider';
import { getSession } from '@/lib/session';
import { CreateTenantDialog } from '@/components/topbar/create-tenant-dialog';

/** A unified row for the list — sourced from the all-tenants search (super-admin)
 * or the caller's own memberships (customer owner). */
type TenantRow = {
  id: string;
  slug: string;
  name: string;
  networkId?: string | null;
  role?: string;
  planName?: string | null;
};

const TENANT_CREATE_PLANS_UI = ['starter', 'growth', 'scale'];

export default function TenantsPage() {
  const router = useRouter();
  const canMultibrand = useFlag('FEATURE_MULTIBRAND_ENABLED');

  const [principal, setPrincipal] = useState<AuthPrincipal | null>(null);
  const [resolved, setResolved] = useState(false);
  const [rows, setRows] = useState<TenantRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  const isSuperAdmin = principal?.isSuperAdmin === true;
  // The caller's own tenants where they're OWNER — the customer (multi-brand) data source.
  const ownedMemberships = useMemo(
    () => (principal?.memberships ?? []).filter((m) => m.role === 'OWNER'),
    [principal],
  );
  const currentPlan = useMemo(
    () => principal?.memberships.find((m) => m.tenantId === principal?.tenantId)?.planName ?? null,
    [principal],
  );
  // Customer can create when they own their current tenant on a paid plan (mirrors the API gate).
  const canCreate =
    isSuperAdmin ||
    (principal?.memberships.find((m) => m.tenantId === principal?.tenantId)?.role === 'OWNER' &&
      TENANT_CREATE_PLANS_UI.includes(currentPlan ?? ''));

  // Whether this principal may see the page at all: super-admins always, customers
  // only with the multi-brand (Scale) entitlement.
  const hasAccess = isSuperAdmin || canMultibrand;

  useEffect(() => {
    let alive = true;
    void (async () => {
      const session = await getSession();
      if (!alive) return;
      setPrincipal(session);
      setResolved(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const load = useCallback(
    async (q: string) => {
      if (!principal) return;
      setError(null);
      if (principal.isSuperAdmin) {
        setRows(null);
        const res = await tenantsApi.search(q);
        if (res.ok) setRows(res.data);
        else setError(res.error);
      } else {
        // Customer: their own owned tenants, filtered client-side by the query.
        const term = q.trim().toLowerCase();
        const owned = principal.memberships
          .filter((m) => m.role === 'OWNER')
          .filter((m) => !term || m.tenantName.toLowerCase().includes(term))
          .map<TenantRow>((m) => ({
            id: m.tenantId,
            slug: m.tenantSlug ?? '',
            name: m.tenantName,
            role: m.role,
            planName: m.planName ?? null,
          }));
        setRows(owned);
      }
    },
    [principal],
  );

  useEffect(() => {
    if (!resolved || !principal || !hasAccess) return;
    void load(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved, principal, hasAccess, load]);

  // Debounced reload on query change (super-admin hits the API; customer filters locally).
  useEffect(() => {
    if (!resolved || !principal || !hasAccess) return;
    const id = window.setTimeout(() => void load(query), 250);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const switchInto = async (tenantId: string) => {
    if (pending || tenantId === principal?.tenantId) return;
    setPending(`switch:${tenantId}`);
    const res = await auth.selectTenant(tenantId);
    if (res.ok) {
      window.location.reload();
      return;
    }
    setPending(null);
    setError(res.error);
  };

  const remove = async (row: TenantRow) => {
    if (pending) return;
    if (!window.confirm(`Delete tenant "${row.name}"? This soft-deletes it and its access.`)) return;
    setPending(`delete:${row.id}`);
    const res = await tenantsApi.remove(row.id);
    setPending(null);
    if (res.ok) setRows((prev) => (prev ? prev.filter((r) => r.id !== row.id) : prev));
    else setError(res.error);
  };

  // ── Feedback states ─────────────────────────────────────────────────
  if (resolved && !hasAccess) {
    return (
      <section className="page-stack">
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] px-6 py-16 text-center">
          <ShieldAlert className="mb-3 h-8 w-8 text-gray-400" />
          <h3 className="mb-1 text-lg font-medium text-gray-900 dark:text-white">No access</h3>
          <p className="max-w-sm text-sm text-gray-600 dark:text-gray-400">
            Managing multiple tenants is part of multi-tenant &amp; multi-brand, available on the
            Scale plan.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="page-stack">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 shrink-0 text-primary" />
            <h1 className="text-2xl font-extrabold">Tenants</h1>
          </div>
          <p className="text-gray-600 dark:text-gray-400">
            {isSuperAdmin
              ? 'Manage every tenant on the platform.'
              : 'Manage the brands you own.'}
          </p>
        </div>
        {canCreate ? (
          <Button onClick={() => setCreateOpen(true)} disabled={!!pending}>
            <Plus className="h-4 w-4 mr-2" />
            Create Tenant
          </Button>
        ) : null}
      </div>

      <SearchInput
        value={query}
        onValueChange={setQuery}
        placeholder={isSuperAdmin ? 'Search all tenants…' : 'Search your tenants…'}
        wrapperClassName="max-w-sm"
      />

      {error ? (
        <div className="rounded-md border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/15 px-4 py-3 text-sm text-red-800 dark:text-red-400">
          {error}
        </div>
      ) : null}

      {rows === null ? (
        <div className="flex items-center justify-center gap-2 h-64 text-gray-600 dark:text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading tenants…
        </div>
      ) : rows.length === 0 ? (
        <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03]">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building2 className="h-12 w-12 text-gray-400 dark:text-gray-500 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
              {query ? 'No tenants match' : 'No tenants yet'}
            </h3>
            {canCreate && !query ? (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" /> Create Tenant
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {rows.map((t) => {
            const active = t.id === principal?.tenantId;
            return (
              <Card
                key={t.id}
                className="border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03]"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-blue-100 dark:bg-blue-500/20 rounded-lg">
                        <Building2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <CardTitle className="text-lg text-gray-900 dark:text-gray-100">
                          {t.name}
                        </CardTitle>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {active ? <Badge variant="info">Current</Badge> : null}
                          {t.planName ? (
                            <Badge variant="secondary" className="capitalize">
                              {t.planName}
                            </Badge>
                          ) : null}
                          {t.role ? (
                            <Badge variant="secondary" className="capitalize">
                              {t.role.toLowerCase()}
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-3">
                    {t.slug ? (
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        <span className="font-medium">Subdomain:</span> {t.slug}
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-2 pt-2">
                      {!active ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!!pending}
                          onClick={() => void switchInto(t.id)}
                        >
                          {pending === `switch:${t.id}` ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          ) : (
                            <ArrowRightLeft className="h-4 w-4 mr-1" />
                          )}
                          Switch
                        </Button>
                      ) : null}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push(`/future/tenants/${t.id}`)}
                      >
                        <Settings className="h-4 w-4 mr-1" /> Manage
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push(`/future/tenants/${t.id}/members`)}
                      >
                        <Users className="h-4 w-4 mr-1" /> Members
                      </Button>
                      {isSuperAdmin ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!!pending}
                          onClick={() => void remove(t)}
                          className="text-red-600 dark:text-red-400"
                        >
                          {pending === `delete:${t.id}` ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4 mr-1" />
                          )}
                          Delete
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CreateTenantDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          // Super-admin re-hits the search API; a customer's new OWNER membership
          // only lands after re-resolving the principal, so refresh it.
          if (isSuperAdmin) void load(query);
          else void getSession().then((s) => setPrincipal(s));
        }}
      />
    </section>
  );
}
