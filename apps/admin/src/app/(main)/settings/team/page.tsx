"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, PlusCircle, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import {
  ConfirmDialog,
  EmptyState,
  Field,
  FormDialog,
  FormSelect,
  Input,
  Textarea,
  StatusBadge,
} from "@uprise/ui";
import { SectionCard } from "@uprise/field";
import { DataTable } from "@uprise/field";
import { UserAvatar } from "@/components/user-profile/user-avatar";
import {
  tenants,
  type AppUserRole,
  type JoinRequest,
  type TenantInvitationSummary,
  type TenantMemberSummary,
} from "@uprise/api-client";
import { getSession } from "@/lib/session";

// ── Helpers ───────────────────────────────────────────────────────────
function relativeTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "–";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "–";
  return new Date(t).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

// Invitations expire this long after they're (re)sent — mirrors INVITATION_TTL_MS in the
// API (apps/api/src/tenants/tenants.service.ts). A resend re-issues the invite and resets
// `expiresAt`, so `expiresAt - TTL` is the time it was LAST sent (and moves when resent).
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** When an invitation was last (re)sent, derived from its reset expiry; null if unknown. */
function lastSentAt(expiresAtIso: string | null): string | null {
  if (!expiresAtIso) return null;
  const t = Date.parse(expiresAtIso);
  return Number.isFinite(t) ? new Date(t - INVITATION_TTL_MS).toISOString() : null;
}

/** Relative countdown to a future instant: "in 6d" / "in 14h" / "in 45m" / "expired". */
function relativeUntil(iso: string | null): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const ms = t - Date.now();
  if (ms <= 0) return "expired";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `in ${hrs}h`;
  return `in ${Math.round(hrs / 24)}d`;
}

const ROLE_LABELS: Record<AppUserRole, string> = {
  OWNER: "Owner",
  ORGANISER: "Organiser",
  VOLUNTEER: "Volunteer",
};

// All three roles, for the role selectors.
const ROLE_OPTIONS = [
  { value: "OWNER", label: "Owner (full workspace + billing)" },
  { value: "ORGANISER", label: "Organiser (staff / admin)" },
  { value: "VOLUNTEER", label: "Volunteer (field)" },
] as const;

/** Role badge handling all three AppUserRole values (RoleChip only covers two). */
function RoleBadge({ role }: { role: AppUserRole }) {
  const tone =
    role === "OWNER"
      ? "bg-warning-container text-warning-foreground"
      : role === "ORGANISER"
        ? "bg-knock-container text-knock"
        : "bg-primary-container/15 text-primary";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.04em] ${tone}`}
    >
      {ROLE_LABELS[role]}
    </span>
  );
}

// ── Combined "requests & invitations" list ────────────────────────────
type PendingKind = "request" | "invitation";
type PendingFilter = "all" | "requests" | "invitations";
const PENDING_FILTERS: PendingFilter[] = ["all", "requests", "invitations"];

type PendingRow = {
  kind: PendingKind;
  id: string;
  email: string;
  role: AppUserRole;
  status: string;
  createdAt: string;
  expiresAt: string | null;
  request?: JoinRequest;
  invitation?: TenantInvitationSummary;
};

/** Persist the filter in the URL hash (#pending=…) so reload/share keeps the view. */
function readPendingFilter(): PendingFilter {
  if (typeof window === "undefined") return "all";
  const v = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("pending");
  return PENDING_FILTERS.includes(v as PendingFilter) ? (v as PendingFilter) : "all";
}

function writePendingFilter(value: PendingFilter) {
  if (typeof window === "undefined") return;
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  if (value === "all") h.delete("pending");
  else h.set("pending", value);
  const qs = h.toString();
  window.history.replaceState(null, "", window.location.pathname + window.location.search + (qs ? `#${qs}` : ""));
}

/** Source badge distinguishing a self sign-up from an emailed invitation. */
function TypeBadge({ kind }: { kind: PendingKind }) {
  const isReq = kind === "request";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.04em] ${
        isReq ? "bg-warning-container text-warning-foreground" : "bg-knock-container text-knock"
      }`}
    >
      {isReq ? "Request" : "Invitation"}
    </span>
  );
}

export default function TeamPage() {
  const { showToast } = useToast();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [checkedSession, setCheckedSession] = useState(false);

  // Combined list filter (defaults to "all"; persisted in the URL hash).
  const [pendingFilter, setPendingFilter] = useState<PendingFilter>("all");
  useEffect(() => setPendingFilter(readPendingFilter()), []);
  const changeFilter = useCallback((value: PendingFilter) => {
    setPendingFilter(value);
    writePendingFilter(value);
  }, []);

  // ── Section 1: Join requests ──
  const [joinRows, setJoinRows] = useState<JoinRequest[] | null>(null);
  const [joinError, setJoinError] = useState("");
  const [busy, setBusy] = useState(false);
  const [approving, setApproving] = useState<JoinRequest | null>(null);
  const [approveRole, setApproveRole] = useState<"ORGANISER" | "VOLUNTEER">("VOLUNTEER");
  const [rejecting, setRejecting] = useState<JoinRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // ── Section 2: Invitations ──
  const [invites, setInvites] = useState<TenantInvitationSummary[] | null>(null);
  const [inviteError, setInviteError] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<AppUserRole>("VOLUNTEER");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [revoking, setRevoking] = useState<TenantInvitationSummary | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);

  // ── Section 3: Members ──
  const [members, setMembers] = useState<TenantMemberSummary[] | null>(null);
  const [membersError, setMembersError] = useState("");
  const [editingMember, setEditingMember] = useState<TenantMemberSummary | null>(null);
  const [editRole, setEditRole] = useState<AppUserRole>("VOLUNTEER");
  const [removingMember, setRemovingMember] = useState<TenantMemberSummary | null>(null);

  // ── Loaders (each section loads independently so one failure isn't fatal) ──
  const loadJoinRequests = useCallback(async (tid: string) => {
    setJoinError("");
    setJoinRows(null);
    const res = await tenants.listJoinRequests(tid, "pending");
    if (!res.ok) {
      setJoinError(res.error);
      return;
    }
    setJoinRows(res.data);
  }, []);

  const loadInvitations = useCallback(async (tid: string) => {
    setInviteError("");
    setInvites(null);
    const res = await tenants.listInvitations(tid);
    if (!res.ok) {
      setInviteError(res.error);
      return;
    }
    setInvites(res.data);
  }, []);

  const loadMembers = useCallback(async (tid: string) => {
    setMembersError("");
    setMembers(null);
    const res = await tenants.listMembers(tid);
    if (!res.ok) {
      setMembersError(res.error);
      return;
    }
    setMembers(res.data);
  }, []);

  const loadAll = useCallback(async () => {
    const session = await getSession();
    const tid = session?.tenantId ?? null;
    // AuthPrincipal.role only expresses ORGANISER/VOLUNTEER (an OWNER signs in as
    // ORGANISER for app purposes); managing the team is organiser-level – matching
    // the API's manage tenant.member / tenant.invitation guards.
    const manage = (session?.role === "ORGANISER" || session?.role === "OWNER") && Boolean(tid);
    setTenantId(tid);
    setCurrentUserId(session?.id ?? null);
    setCanManage(manage);
    setCheckedSession(true);
    if (!tid || !manage) return;
    void loadJoinRequests(tid);
    void loadInvitations(tid);
    void loadMembers(tid);
  }, [loadJoinRequests, loadInvitations, loadMembers]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // ── Join-request actions ──
  const doApprove = async () => {
    if (!tenantId || !approving) return;
    setBusy(true);
    const res = await tenants.approveJoinRequest(tenantId, approving.id, { role: approveRole });
    setBusy(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't approve", description: res.error });
      return;
    }
    showToast({ tone: "success", title: "Approved", description: `${approving.email} can now sign in.` });
    setApproving(null);
    void loadJoinRequests(tenantId);
    void loadMembers(tenantId);
  };

  const doReject = async () => {
    if (!tenantId || !rejecting) return;
    setBusy(true);
    const res = await tenants.rejectJoinRequest(tenantId, rejecting.id, {
      reason: rejectReason.trim() || undefined,
    });
    setBusy(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't reject", description: res.error });
      return;
    }
    showToast({ tone: "info", title: "Request rejected" });
    setRejecting(null);
    setRejectReason("");
    void loadJoinRequests(tenantId);
  };

  // ── Invitation actions ──
  const doInvite = async () => {
    if (!tenantId) return;
    const email = inviteEmail.trim().toLowerCase();
    if (!email) {
      showToast({ tone: "error", title: "Email required" });
      return;
    }
    setInviteBusy(true);
    const res = await tenants.createInvitation(tenantId, { email, role: inviteRole });
    setInviteBusy(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't send invitation", description: res.error });
      return;
    }
    showToast({ tone: "success", title: "Invitation sent", description: `${email} has been invited.` });
    setInviteEmail("");
    setInviteRole("VOLUNTEER");
    void loadInvitations(tenantId);
  };

  const doRevoke = async () => {
    if (!tenantId || !revoking) return;
    setBusy(true);
    const res = await tenants.revokeInvitation(tenantId, revoking.id);
    setBusy(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't revoke", description: res.error });
      return;
    }
    showToast({ tone: "info", title: "Invitation revoked" });
    setRevoking(null);
    void loadInvitations(tenantId);
  };

  const doResend = async (invite: TenantInvitationSummary) => {
    if (!tenantId) return;
    setResendingId(invite.id);
    // Resend = re-issue: createInvitation upserts on (tenant, email), resetting the
    // token + expiry and re-emitting tenant.invitation.sent (the email/SMS reaction).
    const res = await tenants.createInvitation(tenantId, { email: invite.email, role: invite.role });
    setResendingId(null);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't resend", description: res.error });
      return;
    }
    showToast({
      tone: "success",
      title: "Invitation resent",
      description: `A fresh invite link is on its way to ${invite.email}.`,
    });
    void loadInvitations(tenantId);
  };

  // ── Member actions ──
  const doUpdateRole = async () => {
    if (!tenantId || !editingMember) return;
    if (editRole === editingMember.role) {
      setEditingMember(null);
      return;
    }
    setBusy(true);
    const res = await tenants.updateMemberRole(tenantId, editingMember.userId, editRole);
    setBusy(false);
    if (!res.ok) {
      // Surfaces the API's last-OWNER guard ("Cannot remove or demote the last owner…").
      showToast({ tone: "error", title: "Couldn't change role", description: res.error });
      return;
    }
    showToast({ tone: "success", title: "Role updated" });
    setEditingMember(null);
    void loadMembers(tenantId);
  };

  const doRemoveMember = async () => {
    if (!tenantId || !removingMember) return;
    setBusy(true);
    const res = await tenants.removeMember(tenantId, removingMember.userId);
    setBusy(false);
    if (!res.ok) {
      // Surfaces the API's last-OWNER guard.
      showToast({ tone: "error", title: "Couldn't remove member", description: res.error });
      return;
    }
    showToast({ tone: "info", title: "Member removed" });
    setRemovingMember(null);
    void loadMembers(tenantId);
  };

  // ── No-permission state (whole page) ──
  const noPermission = checkedSession && !canManage;

  // ── Combined requests + invitations rows ──
  const requestRows: PendingRow[] = (joinRows ?? []).map((r) => ({
    kind: "request",
    id: `req:${r.id}`,
    email: r.email,
    role: r.requestedRole === "staff" ? "ORGANISER" : "VOLUNTEER",
    status: r.status,
    createdAt: r.createdAt,
    expiresAt: null,
    request: r,
  }));
  const inviteRows: PendingRow[] = (invites ?? []).map((i) => ({
    kind: "invitation",
    id: `inv:${i.id}`,
    email: i.email,
    role: i.role,
    status: i.status,
    createdAt: i.createdAt,
    expiresAt: i.expiresAt,
    invitation: i,
  }));
  const pendingRows = [...requestRows, ...inviteRows].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
  const visiblePending = pendingRows.filter((r) =>
    pendingFilter === "all" ? true : pendingFilter === "requests" ? r.kind === "request" : r.kind === "invitation",
  );
  const joinSettled = joinRows !== null || joinError !== "";
  const inviteSettled = invites !== null || inviteError !== "";
  const pendingLoading = !joinSettled || !inviteSettled;
  const bothPendingErrored = Boolean(joinError) && Boolean(inviteError);
  const retryPending = () => {
    if (!tenantId) return;
    void loadJoinRequests(tenantId);
    void loadInvitations(tenantId);
  };

  return (
    <div className="page-stack">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/settings">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Settings
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <Users className="h-6 w-6 shrink-0 text-primary" />
          <h1 className="text-2xl font-extrabold">Team</h1>
        </div>
      </div>

      {noPermission ? (
        <SectionCard title="Team">
          <EmptyState
            title="Organisers only"
            description="You need organiser access to manage this workspace's team."
          />
        </SectionCard>
      ) : (
        <>
          {/* ── 1+2. Requests & invitations (combined, filterable) ──── */}
          <SectionCard
            title="Requests & invitations"
            description="People awaiting approval and pending email invitations. The filter is saved in the page URL."
          >
            {/* Invite by email */}
            <form
              className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                void doInvite();
              }}
            >
              <Field label="Invite by email" htmlFor="invite-email" className="flex-1">
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="name@example.org"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  disabled={inviteBusy}
                />
              </Field>
              <Field label="Role" htmlFor="invite-role" className="sm:w-56">
                <FormSelect
                  id="invite-role"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as AppUserRole)}
                  options={ROLE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                  disabled={inviteBusy}
                />
              </Field>
              <Button type="submit" disabled={inviteBusy || !inviteEmail.trim()}>
                <PlusCircle className="mr-1 h-4 w-4" />
                {inviteBusy ? "Inviting…" : "Invite"}
              </Button>
            </form>

            {/* Filter (defaults to All; persisted in the URL hash) */}
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {(
                [
                  { key: "all", label: "All", count: pendingRows.length },
                  { key: "requests", label: "Requests", count: requestRows.length },
                  { key: "invitations", label: "Invitations", count: inviteRows.length },
                ] as const
              ).map((f) => (
                <Button
                  key={f.key}
                  size="sm"
                  variant={pendingFilter === f.key ? "default" : "outline"}
                  onClick={() => changeFilter(f.key)}
                >
                  {f.label}
                  <span className="ml-1.5 text-xs opacity-70">{f.count}</span>
                </Button>
              ))}
            </div>

            {pendingLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : bothPendingErrored ? (
              <EmptyState
                title="Couldn't load this list"
                description={joinError || inviteError}
                ctaLabel="Retry"
                onCta={retryPending}
              />
            ) : (
              <>
                {joinError ? (
                  <p className="mb-3 text-sm text-error">
                    Couldn&apos;t load join requests: {joinError}{" "}
                    <button
                      type="button"
                      className="underline"
                      onClick={() => tenantId && void loadJoinRequests(tenantId)}
                    >
                      Retry
                    </button>
                  </p>
                ) : null}
                {inviteError ? (
                  <p className="mb-3 text-sm text-error">
                    Couldn&apos;t load invitations: {inviteError}{" "}
                    <button
                      type="button"
                      className="underline"
                      onClick={() => tenantId && void loadInvitations(tenantId)}
                    >
                      Retry
                    </button>
                  </p>
                ) : null}
                {visiblePending.length === 0 ? (
                  <EmptyState
                    title={
                      pendingFilter === "requests"
                        ? "No join requests"
                        : pendingFilter === "invitations"
                          ? "No invitations"
                          : "Nothing pending"
                    }
                    description={
                      pendingFilter === "requests"
                        ? "New sign-ups awaiting approval will appear here."
                        : pendingFilter === "invitations"
                          ? "People you invite by email will appear here until they accept."
                          : "New sign-ups and pending invitations will appear here."
                    }
                  />
                ) : (
                  <DataTable
                    rows={visiblePending}
                    rowKey={(r) => r.id}
                    columns={[
                      { key: "type", header: "Type", cell: (r) => <TypeBadge kind={r.kind} /> },
                      { key: "email", header: "Email", cell: (r) => r.email },
                      { key: "role", header: "Role", cell: (r) => <RoleBadge role={r.role} /> },
                      {
                        key: "status",
                        header: "Status",
                        cell: (r) => <StatusBadge status={r.status.toUpperCase()} />,
                      },
                      {
                        key: "when",
                        header: "When",
                        cell: (r) => {
                          // Invitations: show when it was LAST sent (a resend resets the
                          // expiry, so derive it from there) + a live countdown to expiry.
                          // Requests: just when the person asked to join.
                          const sent =
                            r.kind === "invitation" ? lastSentAt(r.expiresAt) ?? r.createdAt : r.createdAt;
                          return (
                            <div className="leading-tight">
                              <div>
                                {r.kind === "invitation" ? "sent " : ""}
                                {relativeTime(sent)}
                              </div>
                              {r.kind === "invitation" && r.expiresAt ? (
                                <div
                                  className="text-xs text-muted-foreground"
                                  title={`Expires ${formatDate(r.expiresAt)}`}
                                >
                                  expires {relativeUntil(r.expiresAt)}
                                </div>
                              ) : null}
                            </div>
                          );
                        },
                      },
                      {
                        key: "actions",
                        header: "",
                        cell: (r) =>
                          r.kind === "request" ? (
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                onClick={() => {
                                  // Privilege-safe default: always VOLUNTEER; the organiser opts up in
                                  // the dialog. The applicant's requestedRole is only a hint.
                                  setApproveRole("VOLUNTEER");
                                  setApproving(r.request!);
                                }}
                              >
                                Approve
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setRejecting(r.request!)}>
                                Reject
                              </Button>
                            </div>
                          ) : r.invitation!.status.toLowerCase() === "pending" ? (
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={resendingId === r.invitation!.id}
                                onClick={() => void doResend(r.invitation!)}
                              >
                                {resendingId === r.invitation!.id ? "Resending…" : "Resend"}
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setRevoking(r.invitation!)}>
                                Revoke
                              </Button>
                            </div>
                          ) : null,
                      },
                    ]}
                  />
                )}
              </>
            )}
          </SectionCard>

          {/* ── 3. Members ──────────────────────────────────────────── */}
          <SectionCard title="Members" description="Everyone with access to this workspace.">
            {members === null ? (
              <Skeleton className="h-24 w-full" />
            ) : membersError ? (
              <EmptyState
                title="Couldn't load members"
                description={membersError}
                ctaLabel="Retry"
                onCta={() => tenantId && void loadMembers(tenantId)}
              />
            ) : members.length === 0 ? (
              <EmptyState title="No members yet" description="Approved sign-ups and accepted invitations appear here." />
            ) : (
              <DataTable
                rows={members}
                rowKey={(m) => m.id}
                columns={[
                  {
                    key: "user",
                    header: "User",
                    cell: (m) => (
                      <div className="flex items-center gap-3">
                        <UserAvatar
                          name={m.user?.displayName || m.user?.email || m.userId}
                          className="h-9 w-9"
                        />
                        <div className="min-w-0 font-medium">
                          <span>{m.user?.displayName || m.user?.email || m.userId}</span>
                          {m.userId === currentUserId ? (
                            <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                          ) : null}
                          {m.user?.displayName && m.user?.email ? (
                            <div className="text-xs font-normal text-muted-foreground">{m.user.email}</div>
                          ) : null}
                        </div>
                      </div>
                    ),
                  },
                  { key: "role", header: "Role", cell: (m) => <RoleBadge role={m.role} /> },
                  { key: "joined", header: "Joined", cell: (m) => relativeTime(m.createdAt) },
                  {
                    key: "actions",
                    header: "",
                    cell: (m) => (
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditRole(m.role);
                            setEditingMember(m);
                          }}
                        >
                          Change role
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setRemovingMember(m)}>
                          Remove
                        </Button>
                      </div>
                    ),
                  },
                ]}
              />
            )}
          </SectionCard>

          {/* ── 4. Roles & permissions (capability matrix) ──────────── */}
          <SectionCard
            title="Roles & permissions"
            description="What each role can do. The source of truth is the API's permission guards; this mirrors them."
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="py-2">Capability</th>
                    <th className="py-2 text-center">Owner</th>
                    <th className="py-2 text-center">Organiser</th>
                    <th className="py-2 text-center">Volunteer</th>
                  </tr>
                </thead>
                <tbody>
                  {SCOPES.map((s) => (
                    <tr key={s.label} className="border-t border-[hsl(var(--muted))]">
                      <td className="py-2 text-foreground">{s.label}</td>
                      <td className="py-2 text-center">
                        {s.owner ? <Check className="mx-auto h-4 w-4 text-success" /> : "–"}
                      </td>
                      <td className="py-2 text-center">
                        {s.organiser ? <Check className="mx-auto h-4 w-4 text-success" /> : "–"}
                      </td>
                      <td className="py-2 text-center">
                        {s.volunteer ? <Check className="mx-auto h-4 w-4 text-success" /> : "–"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </>
      )}

      {/* ── Dialogs ──────────────────────────────────────────────── */}
      <FormDialog
        open={Boolean(approving)}
        title={`Approve ${approving?.email ?? ""}`}
        description="Assign their role. Self-selected role is only a hint – you decide their access."
        onClose={() => setApproving(null)}
        onSubmit={() => void doApprove()}
        submitLabel="Approve"
        busy={busy}
      >
        <Field label="Role" htmlFor="approve-role">
          <FormSelect
            id="approve-role"
            value={approveRole}
            onChange={(e) => setApproveRole(e.target.value as "ORGANISER" | "VOLUNTEER")}
            options={[
              { value: "VOLUNTEER", label: "Volunteer (field)" },
              { value: "ORGANISER", label: "Organiser (staff / admin)" },
            ]}
          />
        </Field>
      </FormDialog>

      <FormDialog
        open={Boolean(rejecting)}
        title={`Reject ${rejecting?.email ?? ""}`}
        description="They can request access again later."
        onClose={() => {
          setRejecting(null);
          setRejectReason("");
        }}
        onSubmit={() => void doReject()}
        submitLabel="Reject"
        busy={busy}
      >
        <Textarea
          placeholder="Reason (optional, not shown to the applicant)"
          rows={3}
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
        />
      </FormDialog>

      <FormDialog
        open={Boolean(editingMember)}
        title="Change role"
        description={editingMember ? `Set the role for ${editingMember.user?.displayName || editingMember.user?.email || editingMember.userId}.` : ""}
        onClose={() => setEditingMember(null)}
        onSubmit={() => void doUpdateRole()}
        submitLabel="Save"
        busy={busy}
      >
        <Field label="Role" htmlFor="edit-role">
          <FormSelect
            id="edit-role"
            value={editRole}
            onChange={(e) => setEditRole(e.target.value as AppUserRole)}
            options={ROLE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          />
        </Field>
      </FormDialog>

      <ConfirmDialog
        open={Boolean(removingMember)}
        title="Remove member"
        description={
          removingMember
            ? `Remove ${removingMember.user?.displayName || removingMember.user?.email || removingMember.userId} from this workspace? They'll lose access immediately.`
            : ""
        }
        confirmLabel="Remove"
        onConfirm={() => void doRemoveMember()}
        onCancel={() => setRemovingMember(null)}
        busy={busy}
      />

      <ConfirmDialog
        open={Boolean(revoking)}
        title="Revoke invitation"
        description={revoking ? `Revoke the invitation for ${revoking.email}? The link will stop working.` : ""}
        confirmLabel="Revoke"
        onConfirm={() => void doRevoke()}
        onCancel={() => setRevoking(null)}
        busy={busy}
      />
    </div>
  );
}

// Capability matrix (folded in from the old settings/roles page). Mirrors the API's
// @RequirePermission guards – Owner has everything Organiser does, plus billing/tenant ops.
const SCOPES = [
  { label: "Knock doors / log dispositions (field app)", owner: true, organiser: true, volunteer: true },
  { label: "View assigned turf & walk lists", owner: true, organiser: true, volunteer: true },
  { label: "Cut turf, build & assign walk lists", owner: true, organiser: true, volunteer: false },
  { label: "Author surveys, scripts, dispositions, journeys", owner: true, organiser: true, volunteer: false },
  { label: "Invite members & manage the team", owner: true, organiser: true, volunteer: false },
  { label: "View results, live war-room, QA", owner: true, organiser: true, volunteer: false },
  { label: "Manage workspace settings & billing", owner: true, organiser: false, volunteer: false },
];
