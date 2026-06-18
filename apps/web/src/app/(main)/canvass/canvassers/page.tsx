"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, UserPlus } from "lucide-react";
import { createCanvasser, listCanvassers } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionCard } from "@/components/canvass/section-card";
import { DataTable } from "@/components/canvass/data-table";
import { RoleChip } from "@/components/canvass/role-chip";
import { useToast } from "@/components/ui/toast";

type Canvasser = { id: string; displayName: string; email: string | null; role: string };

export default function CanvassersPage() {
  const { showToast } = useToast();
  const [rows, setRows] = useState<Canvasser[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"CANVASSER" | "ORGANISER">("CANVASSER");
  const [busy, setBusy] = useState(false);

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
    const res = await createCanvasser({
      displayName: name.trim(),
      email: email.trim(),
      password,
      role,
    });
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
        <div className="grid gap-2 sm:grid-cols-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" />
          <Input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Temporary password (8+ chars)"
            type="password"
          />
          <div className="flex gap-2">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "CANVASSER" | "ORGANISER")}
              className="h-11 flex-1 rounded-[11px] border border-border bg-white px-3 text-sm"
            >
              <option value="CANVASSER">Canvasser</option>
              <option value="ORGANISER">Organiser</option>
            </select>
            <Button onClick={handleInvite} disabled={busy}>
              <UserPlus className="mr-1.5 h-4 w-4" />
              Invite
            </Button>
          </div>
        </div>
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
          ]}
        />
      )}
    </div>
  );
}
