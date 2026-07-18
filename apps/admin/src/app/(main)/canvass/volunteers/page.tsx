"use client";

import { useCallback, useState } from "react";
import { Megaphone, Pencil, Phone } from "lucide-react";
import { listVolunteers, updateVolunteer } from "@/lib/api";
import { CampaignPageHeader } from "@/components/canvass/campaign-page-header";
import { useSoftphone } from "@/components/softphone/softphone-provider";
import { useApi } from "@/lib/use-api";
import { StateRegion } from "@/components/shell/state-region";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { FormDialog } from "@/components/ui/form-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable } from "@uprise/field";
import { RoleChip } from "@uprise/field";
import { InviteVolunteerCard } from "@/components/canvass/invite-volunteer-card";
import { ShareSignupLinkCard } from "@/components/canvass/share-signup-link-card";
import { useToast } from "@/components/ui/toast";

type Role = "VOLUNTEER" | "ORGANISER";
type Volunteer = { id: string; displayName: string; email: string | null; role: string; mobile: string | null };

export default function VolunteersPage() {
  const { showToast } = useToast();
  const { startCall } = useSoftphone();
  const { data, loading, error, noPermission, refetch } = useApi(
    "/canvass/volunteers",
    () => listVolunteers(),
    { ttlMs: 30_000 },
  );
  const rows: Volunteer[] = data ?? [];

  const [editing, setEditing] = useState<Volunteer | null>(null);
  const [editForm, setEditForm] = useState<{ displayName: string; role: Role; password: string; mobile: string }>({
    displayName: "",
    role: "VOLUNTEER",
    password: "",
    mobile: "",
  });
  const [editBusy, setEditBusy] = useState(false);

  const openEdit = (c: Volunteer) => {
    setEditing(c);
    setEditForm({
      displayName: c.displayName,
      role: c.role === "ORGANISER" ? "ORGANISER" : "VOLUNTEER",
      password: "",
      mobile: c.mobile ?? "",
    });
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
      mobile: editForm.mobile.trim(),
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
        description="Invite and manage the people knocking doors and making calls."
      />

      <ShareSignupLinkCard />

      <InviteVolunteerCard onInvited={() => void refetch()} />

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
        <Field label="Mobile number" htmlFor="cv-edit-mobile" hint="For click-to-call and SMS. Include the country code, e.g. +61412345678.">
          <Input
            id="cv-edit-mobile"
            type="tel"
            inputMode="tel"
            value={editForm.mobile}
            onChange={(e) => setEditForm((f) => ({ ...f, mobile: e.target.value }))}
            placeholder="+61412345678"
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
