"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { EmptyState, Field, FormDialog, FormSelect, Textarea, StatusBadge } from "@yarns/ui";
import { SectionCard } from "@/components/canvass/section-card";
import { DataTable } from "@/components/canvass/data-table";
import { RoleChip } from "@/components/canvass/role-chip";
import { tenants, type JoinRequest } from "@yarns/api-client";
import { getSession } from "@/lib/session";

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

export default function TeamPage() {
  const { showToast } = useToast();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [isOrganiser, setIsOrganiser] = useState(true);
  const [rows, setRows] = useState<JoinRequest[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Approve/reject dialog state
  const [approving, setApproving] = useState<JoinRequest | null>(null);
  const [approveRole, setApproveRole] = useState<"ORGANISER" | "CANVASSER">("CANVASSER");
  const [rejecting, setRejecting] = useState<JoinRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(async () => {
    setError("");
    setRows(null);
    const session = await getSession();
    const tid = session?.tenantId ?? null;
    setTenantId(tid);
    setIsOrganiser(session?.role === "ORGANISER");
    if (!tid || session?.role !== "ORGANISER") {
      setRows([]);
      return;
    }
    const res = await tenants.listJoinRequests(tid, "pending");
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setRows(res.data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
    void load();
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
    void load();
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
        <h1 className="text-2xl font-extrabold">Team</h1>
      </div>

      <SectionCard
        title="Join requests"
        description="People who signed up and are awaiting approval into this workspace."
      >
        {!isOrganiser ? (
          <EmptyState title="Organisers only" description="You need organiser access to review join requests." />
        ) : rows === null ? (
          <Skeleton className="h-24 w-full" />
        ) : error ? (
          <EmptyState title="Couldn't load requests" description={error} ctaLabel="Retry" onCta={() => void load()} />
        ) : rows.length === 0 ? (
          <EmptyState title="No pending requests" description="New sign-ups awaiting approval will appear here." />
        ) : (
          <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            columns={[
              { key: "email", header: "Email", cell: (r) => r.email },
              {
                key: "requestedRole",
                header: "Requested",
                cell: (r) => (
                  <RoleChip role={r.requestedRole === "staff" ? "ORGANISER" : "CANVASSER"} />
                ),
              },
              { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status.toUpperCase()} /> },
              { key: "when", header: "Requested", cell: (r) => relativeTime(r.createdAt) },
              {
                key: "actions",
                header: "",
                cell: (r) => (
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        // Privilege-safe default: always CANVASSER; the organiser opts up to
                        // ORGANISER in the dialog. The applicant's requestedRole is only a hint.
                        setApproveRole("CANVASSER");
                        setApproving(r);
                      }}
                    >
                      Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setRejecting(r)}>
                      Reject
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        )}
      </SectionCard>

      <FormDialog
        open={Boolean(approving)}
        title={`Approve ${approving?.email ?? ""}`}
        description="Assign their role. Self-selected role is only a hint — you decide their access."
        onClose={() => setApproving(null)}
        onSubmit={() => void doApprove()}
        submitLabel="Approve"
        busy={busy}
      >
        <Field label="Role" htmlFor="approve-role">
          <FormSelect
            id="approve-role"
            value={approveRole}
            onChange={(e) => setApproveRole(e.target.value as "ORGANISER" | "CANVASSER")}
            options={[
              { value: "CANVASSER", label: "Canvasser (volunteer)" },
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
    </div>
  );
}
