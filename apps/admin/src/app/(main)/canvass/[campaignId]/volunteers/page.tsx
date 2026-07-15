"use client";

import { useCallback, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Megaphone, Pencil, Phone, UserPlus } from "lucide-react";
import { CampaignPageHeader } from "@/components/canvass/campaign-page-header";
import { useSoftphone } from "@/components/softphone/softphone-provider";
import {
  createVolunteer,
  listTurfs,
  listVolunteers,
  updateVolunteer,
  type TurfSummary,
} from "@/lib/api";
import { getCampaign } from "@/lib/api/campaigns";
import { useApi } from "@/lib/use-api";
import { StateRegion } from "@/components/shell/state-region";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { FormDialog } from "@/components/ui/form-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionCard, DataTable, RoleChip, ProgressBar } from "@uprise/field";
import { useToast } from "@/components/ui/toast";

type Role = "VOLUNTEER" | "ORGANISER";
type Volunteer = { id: string; displayName: string; email: string | null; role: string; mobile: string | null };

/** One volunteer's load on this campaign, folded up from their assigned turf. */
type CampaignVolunteer = {
  volunteerId: string;
  name: string;
  turfs: number;
  visitedStops: number;
  totalStops: number;
};

/** Fold the campaign's turf list into per-volunteer assignment rows. */
function foldAssignments(turfs: TurfSummary[]): CampaignVolunteer[] {
  const byVol = new Map<string, CampaignVolunteer>();
  for (const t of turfs) {
    if (!t.assignedTo) continue;
    const cur =
      byVol.get(t.assignedTo.volunteerId) ??
      { volunteerId: t.assignedTo.volunteerId, name: t.assignedTo.name, turfs: 0, visitedStops: 0, totalStops: 0 };
    cur.turfs += 1;
    cur.visitedStops += t.visitedStops;
    cur.totalStops += t.totalStops;
    byVol.set(t.assignedTo.volunteerId, cur);
  }
  return [...byVol.values()].sort((a, b) => b.turfs - a.turfs || a.name.localeCompare(b.name));
}

export default function CampaignVolunteersPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const { showToast } = useToast();
  const { startCall } = useSoftphone();

  // Campaign name for the header (chrome — the page still works if it hasn't loaded).
  const { data: campaign } = useApi(
    `/canvass/campaigns/${campaignId}`,
    () => getCampaign(campaignId),
    { ttlMs: 60_000 },
  );

  // Who's working THIS campaign — derived from turf assignments.
  const turfState = useApi(
    `/canvass/turfs?campaignId=${campaignId}`,
    () => listTurfs(campaignId),
    { ttlMs: 30_000 },
  );
  const assigned = useMemo(() => foldAssignments(turfState.data ?? []), [turfState.data]);

  // The tenant field-login roster you invite from and assign to turf.
  const { data, loading, error, noPermission, refetch } = useApi(
    "/canvass/volunteers",
    () => listVolunteers(),
    { ttlMs: 30_000 },
  );
  const rows: Volunteer[] = data ?? [];

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("VOLUNTEER");
  const [busy, setBusy] = useState(false);

  const [editing, setEditing] = useState<Volunteer | null>(null);
  const [editForm, setEditForm] = useState<{ displayName: string; role: Role; password: string }>({
    displayName: "",
    role: "VOLUNTEER",
    password: "",
  });
  const [editBusy, setEditBusy] = useState(false);

  const handleInvite = useCallback(async () => {
    if (!name.trim() || !email.trim() || password.length < 8) {
      showToast({ tone: "warning", title: "Fill all fields", description: "Password must be 8+ characters." });
      return;
    }
    setBusy(true);
    const res = await createVolunteer({ displayName: name.trim(), email: email.trim(), password, role });
    setBusy(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't create login", description: res.error });
      return;
    }
    setName("");
    setEmail("");
    setPassword("");
    void refetch();
    showToast({ tone: "success", title: "Field login created", description: res.data.email ?? "" });
  }, [name, email, password, role, refetch, showToast]);

  const openEdit = (c: Volunteer) => {
    setEditing(c);
    setEditForm({ displayName: c.displayName, role: c.role === "ORGANISER" ? "ORGANISER" : "VOLUNTEER", password: "" });
  };

  const submitEdit = useCallback(async () => {
    if (!editing || !editForm.displayName.trim()) return;
    if (editForm.password && editForm.password.length < 8) {
      showToast({ tone: "warning", title: "Password too short", description: "Use 8+ characters, or leave blank." });
      return;
    }
    setEditBusy(true);
    const res = await updateVolunteer(editing.id, {
      displayName: editForm.displayName.trim(),
      role: editForm.role,
      password: editForm.password || undefined,
    });
    setEditBusy(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't update", description: res.error });
      return;
    }
    setEditing(null);
    void refetch();
    showToast({ tone: "success", title: "Volunteer updated" });
  }, [editing, editForm, refetch, showToast]);

  return (
    <div className="page-stack">
      <CampaignPageHeader
        title="Volunteers"
        icon={Megaphone}
        description={
          <>
            Who&apos;s knocking doors for{" "}
            <span className="font-semibold text-foreground">{campaign?.name ?? "this campaign"}</span> — plus
            the team roster you invite from and assign turf to.
          </>
        }
      />

      {/* ── On this campaign: assignments folded from turf ── */}
      <SectionCard
        title="On this campaign"
        description="Volunteers with turf assigned in this campaign, and how far through it they are."
      >
        <StateRegion
          loading={turfState.loading}
          error={turfState.error}
          noPermission={turfState.noPermission}
          onRetry={() => void turfState.refetch()}
          empty={assigned.length === 0}
          emptyTitle="No one assigned yet"
          emptyDescription="Assign turf to a volunteer on the cut-turf map and they'll show up here."
          skeleton={<Skeleton className="h-32 w-full" />}
        >
          <DataTable
            rows={assigned}
            rowKey={(r) => r.volunteerId}
            empty="No one assigned yet."
            columns={[
              { key: "name", header: "Volunteer", cell: (r) => <span className="font-semibold text-foreground">{r.name}</span> },
              { key: "turfs", header: "Turf", cell: (r) => <span className="tabular-nums">{r.turfs}</span> },
              {
                key: "progress",
                header: "Doors knocked",
                cell: (r) => (
                  <ProgressBar
                    className="min-w-[140px]"
                    value={r.visitedStops}
                    max={r.totalStops || 1}
                    label={
                      <span className="tabular-nums">
                        {r.visitedStops}/{r.totalStops} ·{" "}
                        {r.totalStops > 0 ? Math.round((r.visitedStops / r.totalStops) * 100) : 0}%
                      </span>
                    }
                  />
                ),
              },
            ]}
          />
        </StateRegion>
      </SectionCard>

      {/* ── Team roster: invite + manage (tenant-wide field logins) ── */}
      <SectionCard title="Invite a volunteer" description="Issues a field login (email + password) for your team.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name" htmlFor="cv-name" required>
            <Input id="cv-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
          </Field>
          <Field label="Email" htmlFor="cv-email" required>
            <Input id="cv-email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@org.au" type="email" />
          </Field>
          <Field label="Temporary password" htmlFor="cv-pw" required hint="8+ characters.">
            <Input id="cv-pw" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" type="password" />
          </Field>
          <Field label="Role" htmlFor="cv-role">
            <Select id="cv-role" value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectItem value="VOLUNTEER">Volunteer</SelectItem>
              <SelectItem value="ORGANISER">Organiser</SelectItem>
            </Select>
          </Field>
        </div>
        <Button className="mt-3" onClick={handleInvite} disabled={busy}>
          <UserPlus className="mr-1.5 h-4 w-4" />
          Invite
        </Button>
      </SectionCard>

      <StateRegion
        loading={loading}
        error={error}
        noPermission={noPermission}
        onRetry={() => void refetch()}
        empty={rows.length === 0}
        emptyTitle="No volunteers yet"
        skeleton={<Skeleton className="h-40 w-full" />}
      >
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          empty="No volunteers yet."
          columns={[
            { key: "name", header: "Name", cell: (r) => r.displayName },
            { key: "email", header: "Email", cell: (r) => r.email ?? "—" },
            {
              key: "mobile",
              header: "Mobile",
              cell: (r) =>
                r.mobile ? <span className="font-mono text-sm">{r.mobile}</span> : <span className="text-muted-foreground">—</span>,
            },
            {
              key: "role",
              header: "Role",
              cell: (r) => <RoleChip role={r.role === "ORGANISER" ? "ORGANISER" : "VOLUNTEER"} />,
            },
            {
              key: "actions",
              header: "",
              cell: (r) => (
                <div className="flex items-center justify-end gap-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!r.mobile}
                    title={r.mobile ? `Call ${r.displayName}` : "No mobile number on file"}
                    onClick={() => r.mobile && void startCall({ toNumber: r.mobile, label: r.displayName })}
                  >
                    <Phone className="mr-1.5 h-3.5 w-3.5" />
                    Call
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                    Edit
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </StateRegion>

      <FormDialog
        open={!!editing}
        title="Edit volunteer"
        onClose={() => setEditing(null)}
        onSubmit={submitEdit}
        busy={editBusy}
        submitDisabled={!editForm.displayName.trim()}
      >
        <Field label="Full name" htmlFor="cv-edit-name" required>
          <Input
            id="cv-edit-name"
            value={editForm.displayName}
            onChange={(e) => setEditForm((f) => ({ ...f, displayName: e.target.value }))}
            autoFocus
          />
        </Field>
        <Field label="Role" htmlFor="cv-edit-role">
          <Select
            id="cv-edit-role"
            value={editForm.role}
            onValueChange={(v) => setEditForm((f) => ({ ...f, role: v as Role }))}
          >
            <SelectItem value="VOLUNTEER">Volunteer</SelectItem>
            <SelectItem value="ORGANISER">Organiser</SelectItem>
          </Select>
        </Field>
        <Field label="Reset password" htmlFor="cv-edit-pw" hint="Leave blank to keep the current password.">
          <Input
            id="cv-edit-pw"
            type="password"
            value={editForm.password}
            onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
            placeholder="New password (8+ chars)"
          />
        </Field>
      </FormDialog>
    </div>
  );
}
