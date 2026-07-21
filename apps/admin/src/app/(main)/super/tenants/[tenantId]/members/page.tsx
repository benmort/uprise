'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Users, ArrowLeft, Loader2, UserPlus, X } from 'lucide-react';
import {
  tenants as tenantsApi,
  type AppUserRole,
  type TenantMemberSummary,
} from '@uprise/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/prog/ui/card';
import { Button } from '@/components/prog/ui/button';
import { Input } from '@/components/prog/ui/input';
import { Label } from '@/components/prog/ui/label';

const ROLES: AppUserRole[] = ['OWNER', 'ORGANISER', 'VOLUNTEER'];

function RoleSelect({
  value,
  disabled,
  onChange,
}: {
  value: AppUserRole;
  disabled?: boolean;
  onChange: (role: AppUserRole) => void;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as AppUserRole)}
      className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-sm text-gray-900 dark:text-gray-100 disabled:opacity-50"
    >
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {r.charAt(0) + r.slice(1).toLowerCase()}
        </option>
      ))}
    </select>
  );
}

export default function TenantMembersPage() {
  const params = useParams();
  const router = useRouter();
  const tenantId = params?.tenantId as string;

  const [members, setMembers] = useState<TenantMemberSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<AppUserRole>('ORGANISER');

  const load = useCallback(async () => {
    setError(null);
    setMembers(null);
    const res = await tenantsApi.listMembers(tenantId);
    if (res.ok) setMembers(res.data);
    else setError(res.error);
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const addMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending || !inviteEmail.trim()) return;
    setPending('add');
    setActionError(null);
    const res = await tenantsApi.addMember(tenantId, { email: inviteEmail.trim(), role: inviteRole });
    setPending(null);
    if (res.ok) {
      setInviteEmail('');
      void load();
    } else {
      setActionError(res.error);
    }
  };

  const changeRole = async (m: TenantMemberSummary, role: AppUserRole) => {
    if (pending || role === m.role) return;
    setPending(`role:${m.userId}`);
    setActionError(null);
    const res = await tenantsApi.updateMemberRole(tenantId, m.userId, role);
    setPending(null);
    if (res.ok) setMembers((prev) => (prev ? prev.map((x) => (x.userId === m.userId ? res.data : x)) : prev));
    else setActionError(res.error);
  };

  const remove = async (m: TenantMemberSummary) => {
    if (pending) return;
    setPending(`remove:${m.userId}`);
    setActionError(null);
    const res = await tenantsApi.removeMember(tenantId, m.userId);
    setPending(null);
    if (res.ok) setMembers((prev) => (prev ? prev.filter((x) => x.userId !== m.userId) : prev));
    else setActionError(res.error);
  };

  return (
    <section className="page-stack">
      <div className="space-y-6 max-w-2xl">
        <Button variant="ghost" size="sm" onClick={() => router.push(`/super/tenants/${tenantId}`)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Tenant Members</h1>
          <p className="text-gray-600 dark:text-gray-400">Manage members for this tenant</p>
        </div>

        {actionError ? (
          <div className="rounded-md border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/15 px-4 py-3 text-sm text-red-800 dark:text-red-400">
            {actionError}
          </div>
        ) : null}

        <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" /> Add an existing user
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={addMember} className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[200px]">
                <Label htmlFor="m-email">Email</Label>
                <Input
                  id="m-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="person@example.com"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="m-role">Role</Label>
                <div className="mt-1">
                  <RoleSelect value={inviteRole} onChange={setInviteRole} />
                </div>
              </div>
              <Button type="submit" disabled={pending === 'add' || !inviteEmail.trim()}>
                {pending === 'add' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Add
              </Button>
            </form>
            <p className="mt-2 text-xs text-gray-500">
              Adds a user who already has an account. To invite someone new, use Settings → Team.
            </p>
          </CardContent>
        </Card>

        <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" /> Members
            </CardTitle>
          </CardHeader>
          <CardContent>
            {members === null ? (
              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                <Loader2 className="h-5 w-5 animate-spin" /> Loading…
              </div>
            ) : error ? (
              <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
            ) : members.length === 0 ? (
              <p className="text-gray-500">No members yet.</p>
            ) : (
              <ul className="space-y-2">
                {members.map((m) => (
                  <li
                    key={m.userId}
                    className="flex items-center justify-between gap-3 py-2 border-b border-gray-200 dark:border-gray-800 last:border-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-gray-900 dark:text-white">
                        {m.user.displayName || m.user.email}
                      </p>
                      {m.user.displayName ? (
                        <p className="truncate text-xs text-gray-500">{m.user.email}</p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <RoleSelect
                        value={m.role}
                        disabled={pending === `role:${m.userId}`}
                        onChange={(role) => void changeRole(m, role)}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Remove member"
                        disabled={pending === `remove:${m.userId}`}
                        onClick={() => void remove(m)}
                        className="text-red-600 dark:text-red-400"
                      >
                        {pending === `remove:${m.userId}` ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <X className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
