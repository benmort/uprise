"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Pencil, UserPlus } from "lucide-react";
import { createCanvasser, listCanvassers, updateCanvasser } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { FormDialog } from "@/components/ui/form-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionCard } from "@/components/canvass/section-card";
import { DataTable } from "@/components/canvass/data-table";
import { RoleChip } from "@/components/canvass/role-chip";
import { useToast } from "@/components/ui/toast";

type Role = "CANVASSER" | "ORGANISER";
type Canvasser = { id: string; displayName: string; email: string | null; role: string };

export default function CanvassersPage() {
  const { showToast } = useToast();
  const [rows, setRows] = useState<Canvasser[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("CANVASSER");
  const [busy, setBusy] = useState(false);

  const [editing, setEditing] = useState<Canvasser | null>(null);
  const [editForm, setEditForm] = useState<{ displayName: string; role: Role; password: string }>({
    displayName: "",
    role: "CANVASSER",
    password: "",
  });
  const [editBusy, setEditBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await listCanvassers();
    if (res.ok) setRows(res.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleInvite = useCallback(async () => {
    if (!name.trim() || !email.trim() || password.length < 8) {
      showToast({ tone: "warning", title: "Fill all fields", description: "Password must be 8+ characters." });
      return;
    }
    setBusy(true);
    const res = await createCanvasser({ displayName: name.trim(), email: email.trim(), password, role });
    setBusy(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't create login", description: res.error });
      return;
    }
    setName("");
    setEmail("");
    setPassword("");
    await load();
    showToast({ tone: "success", title: "Field login created", description: res.data.email ?? "" });
  }, [name, email, password, role, load, showToast]);

  const openEdit = (c: Canvasser) => {
    setEditing(c);
    setEditForm({ displayName: c.displayName, role: c.role === "ORGANISER" ? "ORGANISER" : "CANVASSER", password: "" });
  };

  const submitEdit = useCallback(async () => {
    if (!editing || !editForm.displayName.trim()) return;
    if (editForm.password && editForm.password.length < 8) {
      showToast({ tone: "warning", title: "Password too short", description: "Use 8+ characters, or leave blank." });
      return;
    }
    setEditBusy(true);
    const res = await updateCanvasser(editing.id, {
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
    await load();
    showToast({ tone: "success", title: "Canvasser updated" });
  }, [editing, editForm, load, showToast]);

  return (
    <div className="page-stack">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/canvass">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Canvass
          </Link>
        </Button>
        <h1 className="text-2xl font-extrabold">Canvassers</h1>
      </div>

      <SectionCard title="Invite a canvasser" description="Issues a field login (email + password).">
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
            <Select id="cv-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="CANVASSER">Canvasser</option>
              <option value="ORGANISER">Organiser</option>
            </Select>
          </Field>
        </div>
        <Button className="mt-3" onClick={handleInvite} disabled={busy}>
          <UserPlus className="mr-1.5 h-4 w-4" />
          Invite
        </Button>
      </SectionCard>

      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          empty="No canvassers yet."
          columns={[
            { key: "name", header: "Name", cell: (r) => r.displayName },
            { key: "email", header: "Email", cell: (r) => r.email ?? "—" },
            {
              key: "role",
              header: "Role",
              cell: (r) => <RoleChip role={r.role === "ORGANISER" ? "ORGANISER" : "CANVASSER"} />,
            },
            {
              key: "actions",
              header: "",
              cell: (r) => (
                <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  Edit
                </Button>
              ),
            },
          ]}
        />
      )}

      <FormDialog
        open={!!editing}
        title="Edit canvasser"
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
            onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value as Role }))}
          >
            <option value="CANVASSER">Canvasser</option>
            <option value="ORGANISER">Organiser</option>
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
