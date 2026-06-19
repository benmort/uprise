"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { listCanvassers } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionCard } from "@/components/canvass/section-card";
import { DataTable } from "@/components/canvass/data-table";
import { RoleChip } from "@/components/canvass/role-chip";

// Scopes per role — the source of truth is the API's @Roles() guards; this mirrors them.
const SCOPES = [
  { label: "Knock doors / log dispositions (field app)", organiser: true, canvasser: true },
  { label: "View assigned turf & walk lists", organiser: true, canvasser: true },
  { label: "Cut turf, build & assign walk lists", organiser: true, canvasser: false },
  { label: "Author surveys, scripts, dispositions, journeys", organiser: true, canvasser: false },
  { label: "Invite canvassers / issue logins", organiser: true, canvasser: false },
  { label: "View results, live war-room, QA", organiser: true, canvasser: false },
];

type Member = { id: string; displayName: string; email: string | null; role: string };

export default function RolesPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await listCanvassers();
      if (alive && res.ok) setMembers(res.data);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="page-stack">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/settings">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Settings
          </Link>
        </Button>
        <h1 className="text-2xl font-extrabold">Roles &amp; permissions</h1>
      </div>

      <SectionCard title="Scopes by role">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="py-2">Capability</th>
                <th className="py-2 text-center">Organiser</th>
                <th className="py-2 text-center">Canvasser</th>
              </tr>
            </thead>
            <tbody>
              {SCOPES.map((s) => (
                <tr key={s.label} className="border-t border-[hsl(var(--muted))]">
                  <td className="py-2 text-foreground">{s.label}</td>
                  <td className="py-2 text-center">{s.organiser ? <Check className="mx-auto h-4 w-4 text-success" /> : "—"}</td>
                  <td className="py-2 text-center">{s.canvasser ? <Check className="mx-auto h-4 w-4 text-success" /> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="People">
        {loading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <DataTable
            rows={members}
            rowKey={(m) => m.id}
            empty="No users yet."
            columns={[
              { key: "name", header: "Name", cell: (m) => m.displayName },
              { key: "email", header: "Email", cell: (m) => m.email ?? "—" },
              {
                key: "role",
                header: "Role",
                cell: (m) => <RoleChip role={m.role === "ORGANISER" ? "ORGANISER" : "CANVASSER"} />,
              },
            ]}
          />
        )}
      </SectionCard>
    </div>
  );
}
