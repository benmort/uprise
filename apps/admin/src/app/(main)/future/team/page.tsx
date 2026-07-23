'use client';

import { Button } from '@/components/prog/ui/button';
import { Avatar, AvatarFallback } from '@/components/prog/ui/avatar';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/prog/ui/card';
import { Modal } from '@/components/prog/ui/modal';
import { useState, useCallback } from 'react';
import { Suspense } from 'react';
import { Loader2, PlusCircle, Pencil, Mail, RefreshCw } from 'lucide-react';
import { CanManageUsers } from '@/components/prog/protected-route';
import {
  FormSectionCard,
  FormEmailChips,
  FormSelect,
  type FormSelectOption,
} from '@/components/prog/shared/forms';
import { Alert } from "@uprise/ui";

// --- Inlined role model (was the schema-types + rbac modules) ----------------
type UserRole = 'owner' | 'admin' | 'member' | 'viewer';
const USER_ROLES = {
  OWNER: 'owner' as UserRole,
  ADMIN: 'admin' as UserRole,
  MEMBER: 'member' as UserRole,
  VIEWER: 'viewer' as UserRole,
};

// Static replica: treat the current user as an owner with full permissions so
// all action buttons render. These stand in for the rbac helpers.
function isValidRoleAssignment(_currentUserRole: UserRole, _targetRole: UserRole): boolean {
  return true;
}
function canManageUser(
  _currentUserRole: UserRole,
  _targetRole: UserRole,
  _action: 'promote' | 'demote' | 'remove'
): boolean {
  return true;
}

const CURRENT_USER = { id: 'u_current', email: 'asha.patel@getup.org.au' };
const CURRENT_USER_ROLE: UserRole = USER_ROLES.OWNER;

type ActionState = {
  error?: string;
  success?: string;
};

type Member = {
  id: string;
  userId: string;
  role: string;
  user?: { id: string; email: string; firstName?: string; lastName?: string };
  grantedBy?: string | null;
  grantedByUser?: { id: string; email: string; firstName?: string; lastName?: string } | null;
};

const MOCK_MEMBERS: Member[] = [
  {
    id: 'mem_1',
    userId: 'u_current',
    role: 'owner',
    user: { id: 'u_current', email: 'asha.patel@getup.org.au', firstName: 'Asha', lastName: 'Patel' },
    grantedBy: null,
    grantedByUser: null,
  },
  {
    id: 'mem_2',
    userId: 'u_liam',
    role: 'admin',
    user: { id: 'u_liam', email: 'liam.nguyen@getup.org.au', firstName: 'Liam', lastName: 'Nguyen' },
    grantedBy: 'u_current',
    grantedByUser: { id: 'u_current', email: 'asha.patel@getup.org.au', firstName: 'Asha', lastName: 'Patel' },
  },
  {
    id: 'mem_3',
    userId: 'u_mia',
    role: 'member',
    user: { id: 'u_mia', email: 'mia.roberts@getup.org.au', firstName: 'Mia', lastName: 'Roberts' },
    grantedBy: 'u_liam',
    grantedByUser: { id: 'u_liam', email: 'liam.nguyen@getup.org.au', firstName: 'Liam', lastName: 'Nguyen' },
  },
  {
    id: 'mem_4',
    userId: 'u_noah',
    role: 'viewer',
    user: { id: 'u_noah', email: 'noah.williams@getup.org.au', firstName: 'Noah', lastName: 'Williams' },
    grantedBy: 'u_liam',
    grantedByUser: { id: 'u_liam', email: 'liam.nguyen@getup.org.au', firstName: 'Liam', lastName: 'Nguyen' },
  },
];

const ALL_ROLE_OPTIONS: FormSelectOption[] = [
  { value: 'owner', label: 'Owner' },
  { value: 'admin', label: 'Admin' },
  { value: 'member', label: 'Member' },
  { value: 'viewer', label: 'Viewer' },
];

function getRoleOptionsForUser(currentUserRole: UserRole): FormSelectOption[] {
  return ALL_ROLE_OPTIONS.filter((opt) =>
    isValidRoleAssignment(currentUserRole, opt.value as UserRole)
  );
}

function TeamMembersSkeleton() {
  return (
    <Card className="mb-8 border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03]">
      <CardHeader>
        <CardTitle className="text-gray-800 dark:text-white/90">Team Members</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="flex flex-col rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] animate-pulse"
            >
              <div className="flex items-start gap-3">
                <div className="size-10 shrink-0 rounded-full bg-gray-200 dark:bg-gray-700" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-4 w-28 bg-gray-200 dark:bg-gray-700 rounded" />
                  <div className="h-3 w-40 bg-gray-200 dark:bg-gray-700 rounded" />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <div className="h-6 w-12 bg-gray-200 dark:bg-gray-700 rounded" />
                <div className="h-6 w-14 bg-gray-200 dark:bg-gray-700 rounded" />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function TeamMembers({ refreshTrigger }: { refreshTrigger?: number }) {
  void refreshTrigger;
  const currentUser = CURRENT_USER;
  const currentUserRole = CURRENT_USER_ROLE;
  const isInitialized = true;
  const [removeState, setRemoveState] = useState<ActionState>({});
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>(MOCK_MEMBERS);
  const membersLoading = false;
  const membersError: string | null = null;
  const isLoading = false;
  const error: string | null = null;
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [editRole, setEditRole] = useState<string>('');
  const [isEditPending, setIsEditPending] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const tenantId = 'tn_root';

  const handleRemoveMember = (member: Member) => {
    setRemovingMemberId(member.id);
    setRemoveState({});
    setMembers((prev) => prev.filter((m) => m.id !== member.id));
    setRemovingMemberId(null);
  };

  const openEditModal = (member: Member) => {
    setEditingMember(member);
    setEditRole(member.role);
    setEditError(null);
    setEditModalOpen(true);
  };

  const closeEditModal = () => {
    if (!isEditPending) {
      setEditModalOpen(false);
      setEditingMember(null);
    }
  };

  const handleUpdateRole = () => {
    if (!editingMember) return;

    if (editRole === editingMember.role) {
      closeEditModal();
      return;
    }

    setIsEditPending(true);
    setEditError(null);
    setMembers((prev) =>
      prev.map((m) =>
        m.id === editingMember.id ? { ...m, role: editRole } : m
      )
    );
    closeEditModal();
    setIsEditPending(false);
  };

  const getMemberDisplayName = (user: { id: string; email: string; firstName?: string; lastName?: string } | undefined) => {
    if (!user) return 'Unknown';
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
    if (fullName) return fullName;
    if (user.email && user.email.includes('@')) return user.email;
    return 'Unknown';
  };

  const getGrantedByDisplay = (member: Member) => {
    if (member.grantedByUser) return getMemberDisplayName(member.grantedByUser);
    if (member.grantedBy) return 'Unknown user';
    return '–';
  };

  if (isLoading || (tenantId && membersLoading)) {
    return <TeamMembersSkeleton />;
  }

  if (error) {
    return (
      <Card className="mb-8 border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03]">
        <CardHeader>
          <CardTitle className="text-gray-800 dark:text-white/90">Team Members</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-red-500 dark:text-red-400">Error loading members: {error}</p>
        </CardContent>
      </Card>
    );
  }

  if (membersError) {
    return (
      <Card className="mb-8 border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03]">
        <CardHeader>
          <CardTitle className="text-gray-800 dark:text-white/90">Team Members</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-red-500 dark:text-red-400">Error loading members: {membersError}</p>
        </CardContent>
      </Card>
    );
  }

  if (!tenantId) {
    return (
      <Card className="mb-8 border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03]">
        <CardHeader>
          <CardTitle className="text-gray-800 dark:text-white/90">Team Members</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground dark:text-gray-400">Loading your workspace…</p>
        </CardContent>
      </Card>
    );
  }

  if (!members?.length) {
    return (
      <Card className="mb-8 border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03]">
        <CardHeader>
          <CardTitle className="text-gray-800 dark:text-white/90">Team Members</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground dark:text-gray-400">No team members yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="mb-8 border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03]">
        <CardHeader>
          <CardTitle className="text-gray-800 dark:text-white/90">Team Members</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {members.map((member) => {
              const targetRole = member.role as UserRole;
              const baseCanEdit =
                canManageUser(currentUserRole, targetRole, 'promote') ||
                canManageUser(currentUserRole, targetRole, 'demote');
              const isEditingSelf = member.userId === currentUser?.id;
              const isSelfOwner = targetRole === USER_ROLES.OWNER;
              const otherOwnersCount = members.filter(
                (m) => m.role === USER_ROLES.OWNER && m.userId !== currentUser?.id
              ).length;
              const canEditOwnerSelf = !isEditingSelf || !isSelfOwner || otherOwnersCount >= 1;
              const canEdit = baseCanEdit && canEditOwnerSelf;
              const ownersCount = members.filter((m) => m.role === USER_ROLES.OWNER).length;
              const isSoleOwner = member.role === USER_ROLES.OWNER && ownersCount === 1;
              const baseCanRemove =
                canManageUser(currentUserRole, member.role as UserRole, 'remove') ||
                member.userId === currentUser?.id;
              const canRemove = baseCanRemove && !isSoleOwner;
              const displayName = getMemberDisplayName(member.user);
              const avatarInitials = displayName
                .split(' ')
                .map((n) => n[0])
                .filter(Boolean)
                .join('')
                .toUpperCase()
                .slice(0, 2) || '?';
              const isRemoving = removingMemberId === member.id;
              return (
                <div
                  key={member.id}
                  data-testid="team-member-card"
                  className={`flex flex-col rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] ${isRemoving ? 'opacity-60 pointer-events-none' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <Avatar>
                      <AvatarFallback>{avatarInitials}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900 dark:text-gray-100 truncate">
                        {displayName}
                      </p>
                      <p className="text-sm text-muted-foreground dark:text-gray-400 truncate">
                        {member.user?.email || '–'} | {member.role}
                      </p>
                      <p className="text-xs text-muted-foreground dark:text-gray-500 truncate mt-0.5">
                        Granted by: {getGrantedByDisplay(member)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {canEdit && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditModal(member)}
                        disabled={!isInitialized}
                        className="cursor-pointer h-6 px-3 py-1 text-xs border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                      >
                        <Pencil className="w-3 h-3 mr-1" />
                        Edit
                      </Button>
                    )}
                    {canRemove && (
                      <Button
                        onClick={() => handleRemoveMember(member)}
                        variant="outline"
                        size="sm"
                        disabled={!isInitialized || removingMemberId === member.id}
                        className="cursor-pointer h-6 px-3 py-1 text-xs border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                      >
                        {removingMemberId === member.id ? 'Removing...' : 'Remove'}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {removeState?.error && (
            <Alert variant="error" title="Error" message={removeState.error} className="mt-4" />
          )}
        </CardContent>
      </Card>

      <Modal isOpen={editModalOpen} onClose={closeEditModal} className="max-w-md m-4">
        <div className="p-6 sm:p-8">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90 mb-1">
            Edit Member Role
          </h3>
          {editingMember && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              Change role for {getMemberDisplayName(editingMember.user)}
            </p>
          )}
          <FormSelect
            label="Role"
            options={getRoleOptionsForUser(currentUserRole)}
            value={editRole}
            onChange={setEditRole}
            className="mb-4"
          />
          {editError && (
            <Alert variant="error" title="Error" message={editError} className="mb-4" />
          )}
          <div className="flex gap-3 justify-end">
            <Button
              variant="outline"
              onClick={closeEditModal}
              disabled={isEditPending}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              className="cursor-pointer bg-brand-500 hover:bg-brand-600"
              onClick={handleUpdateRole}
              disabled={isEditPending}
            >
              {isEditPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save'
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

type Invitation = {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string;
  token?: string;
  invitedBy?: string;
  createdAt?: string;
};

const MOCK_INVITATIONS: Invitation[] = [
  {
    id: 'inv_1',
    email: 'jordan.lee@getup.org.au',
    role: 'member',
    status: 'pending',
    expiresAt: '2026-07-01T09:00:00.000Z',
    token: 'tok_jordan',
  },
  {
    id: 'inv_2',
    email: 'priya.sharma@getup.org.au',
    role: 'admin',
    status: 'pending',
    expiresAt: '2026-07-03T09:00:00.000Z',
    token: 'tok_priya',
  },
  {
    id: 'inv_3',
    email: 'sam.taylor@getup.org.au',
    role: 'viewer',
    status: 'expired',
    expiresAt: '2026-06-10T09:00:00.000Z',
  },
];

function InvitationsListSkeleton() {
  return (
    <Card className="mb-8 border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03]">
      <CardHeader>
        <CardTitle className="text-gray-800 dark:text-white/90">Invitations</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-4 py-3 border-b border-gray-100 last:border-b-0 dark:border-gray-800 animate-pulse"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 shrink-0 size-10" />
                <div className="min-w-0 space-y-2">
                  <div className="h-4 w-40 bg-gray-200 dark:bg-gray-700 rounded" />
                  <div className="h-3 w-56 bg-gray-200 dark:bg-gray-700 rounded" />
                </div>
                <div className="h-5 w-14 rounded-full bg-gray-200 dark:bg-gray-700 shrink-0" />
              </div>
              <div className="h-4 w-16 bg-gray-200 dark:bg-gray-700 rounded shrink-0" />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function InvitationsList({ refreshTrigger }: { refreshTrigger?: number }) {
  void refreshTrigger;
  const tenantId = 'tn_root';
  const [invitations, setInvitations] = useState<Invitation[]>(MOCK_INVITATIONS);
  const loading = false;
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [resendCountdown, setResendCountdown] = useState<Record<string, number>>({});

  const handleResend = (inv: Invitation) => {
    if (resendingId) return;
    setResendingId(inv.id);
    setError(null);
    setSuccess('Invitation resent successfully.');
    setResendCountdown((prev) => ({ ...prev, [inv.id]: 30 }));
    setResendingId(null);
  };

  const handleRevoke = (inv: Invitation) => {
    if (revokingId || !inv.token) return;
    setRevokingId(inv.id);
    setError(null);
    setSuccess(null);
    setInvitations((prev) => prev.filter((i) => i.id !== inv.id));
    setRevokingId(null);
  };

  const formatExpiresAt = (s: string) => {
    try {
      return new Date(s).toLocaleString('en-AU', {
        timeZone: 'Australia/Sydney',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      });
    } catch {
      return s;
    }
  };

  const getStatusBadge = (status: string) => {
    const s = (status || '').toLowerCase();
    const classes: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-500',
      declined: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-500',
      expired: 'bg-gray-100 text-gray-800 dark:bg-gray-500/15 dark:text-gray-400',
    };
    return (
      <span
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${classes[s] ?? classes.pending}`}
      >
        {s || 'pending'}
      </span>
    );
  };

  if (!tenantId) return null;
  if (loading) return <InvitationsListSkeleton />;

  return (
    <Card className="mb-8 border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03]">
      <CardHeader>
        <CardTitle className="text-gray-800 dark:text-white/90">Invitations</CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="error" title="Error" message={error} className="mb-4" />
        )}
        {success && (
          <Alert variant="success" title="Success" message={success} className="mb-4" />
        )}
        {invitations.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[160px] w-full rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-white/[0.02]">
            <Mail className="h-10 w-10 text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No invitations</p>
          </div>
        ) : (
          <ul className="space-y-4">
            {invitations.map((inv) => {
              const countdown = resendCountdown[inv.id] ?? 0;
              const resendDisabled = countdown > 0 || resendingId === inv.id;
              return (
                <li
                  key={inv.id}
                  className="flex items-center justify-between gap-4 py-3 border-b border-gray-100 last:border-b-0 dark:border-gray-800"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 shrink-0">
                      <Mail className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 dark:text-gray-100 truncate">
                        {inv.email}
                      </p>
                      <p className="text-sm text-muted-foreground dark:text-gray-400">
                        {inv.role} · Expires {formatExpiresAt(inv.expiresAt)}
                      </p>
                    </div>
                    {getStatusBadge(inv.status)}
                  </div>
                  <div className="shrink-0 flex items-center gap-3">
                    <span className="text-gray-700 dark:text-gray-400 text-sm">
                      Didn&apos;t receive it?{' '}
                      <button
                        type="button"
                        onClick={() => handleResend(inv)}
                        disabled={resendDisabled}
                        className="text-brand-500 hover:text-brand-600 dark:text-brand-400 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                      >
                        {resendDisabled
                          ? countdown > 0
                            ? `Resend in ${countdown}s`
                            : 'Sending...'
                          : 'Resend'}
                      </button>
                    </span>
                    {inv.status?.toLowerCase() === 'pending' && inv.token && (
                      <button
                        type="button"
                        onClick={() => handleRevoke(inv)}
                        disabled={revokingId === inv.id}
                        className="text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                      >
                        {revokingId === inv.id ? 'Revoking...' : 'Revoke'}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function InviteTeamMemberSkeleton() {
  return (
    <FormSectionCard title="Invite Team Member" className="h-[260px]">
      <div className="animate-pulse space-y-4">
        <div className="h-11 bg-gray-200 dark:bg-gray-700 rounded-lg" />
        <div className="h-11 bg-gray-200 dark:bg-gray-700 rounded-lg" />
      </div>
    </FormSectionCard>
  );
}

function InviteTeamMember({ onInvitationCreated }: { onInvitationCreated?: () => void }) {
  const currentUserRole = CURRENT_USER_ROLE;
  const [inviteState, setInviteState] = useState<ActionState>({});
  const [isInvitePending, setIsInvitePending] = useState(false);
  const [emails, setEmails] = useState<string[]>([]);
  const [role, setRole] = useState<string>('member');

  const tenantId = 'tn_root';

  const canInvite = currentUserRole === USER_ROLES.OWNER || currentUserRole === USER_ROLES.ADMIN;

  const handleInviteMember = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canInvite || emails.length === 0 || !tenantId) return;

    setIsInvitePending(true);
    setInviteState({});
    setInviteState({
      success: `Invitation${emails.length > 1 ? 's' : ''} sent successfully.`,
    });
    setEmails([]);
    onInvitationCreated?.();
    setIsInvitePending(false);
  };

  return (
    <FormSectionCard title="Invite Team Member" description="Invite new members by email. They will receive an invitation to join your team.">
      <form onSubmit={handleInviteMember} className="space-y-5">
        <FormEmailChips
          label="Email addresses"
          value={emails}
          onChange={setEmails}
          placeholder="Enter email and press Enter, comma, or space"
          disabled={!canInvite}
          required
        />
        <div className="w-full md:w-1/2">
          <FormSelect
            label="Role"
            options={getRoleOptionsForUser(currentUserRole)}
            value={role}
            onChange={setRole}
            state={!canInvite ? "disabled" : "default"}
          />
        </div>
        {inviteState?.error && (
          <Alert variant="error" title="Error" message={inviteState.error} />
        )}
        {inviteState?.success && (
          <Alert variant="success" title="Success" message={inviteState.success} />
        )}
        <div className="flex gap-3">
          <Button
            type="submit"
            className="cursor-pointer bg-brand-500 hover:bg-brand-600 text-white"
            disabled={isInvitePending || !canInvite || !tenantId || emails.length === 0}
          >
            {isInvitePending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Inviting...
              </>
            ) : (
              <>
                <PlusCircle className="mr-2 h-4 w-4" />
                Invite Member{emails.length > 1 ? 's' : ''}
              </>
            )}
          </Button>
        </div>
      </form>
      {!canInvite && (
        <p className="mt-4 text-sm text-muted-foreground dark:text-gray-400">
          You must be a team owner or admin to invite new members.
        </p>
      )}
    </FormSectionCard>
  );
}

export default function TeamPage() {
  const [invitationsRefreshTrigger, setInvitationsRefreshTrigger] = useState(0);
  const [membersRefreshTrigger, setMembersRefreshTrigger] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    setMembersRefreshTrigger((t) => t + 1);
    setInvitationsRefreshTrigger((t) => t + 1);
    setTimeout(() => setIsRefreshing(false), 500);
  }, []);

  return (
    <CanManageUsers>
      <div className="page-stack">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Team</h1>
              <p className="text-gray-600 dark:text-gray-400">Manage your team members and permissions</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="cursor-pointer shrink-0"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          <Suspense fallback={<TeamMembersSkeleton />}>
            <TeamMembers key={membersRefreshTrigger} refreshTrigger={membersRefreshTrigger} />
          </Suspense>
          <Suspense fallback={<InviteTeamMemberSkeleton />}>
            <InviteTeamMember onInvitationCreated={() => setInvitationsRefreshTrigger((t) => t + 1)} />
          </Suspense>
          <Suspense fallback={<InvitationsListSkeleton />}>
            <InvitationsList key={invitationsRefreshTrigger} refreshTrigger={invitationsRefreshTrigger} />
          </Suspense>
      </div>
    </CanManageUsers>
  );
}
