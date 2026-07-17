"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, UserPlus, X } from "lucide-react";
import {
  approveShiftRequest,
  assignShift,
  denyShiftRequest,
  listShiftAssignments,
  releaseShiftAssignment,
  type ShiftAssignmentRow,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Select, SelectItem } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";

type Volunteer = { id: string; displayName: string; email: string | null };

/** Per-shift roster: pending requests (approve/deny), confirmed seats (release), and an
 *  organiser assign control. `onChange` bubbles so the parent can refresh seat counts. */
export function ShiftRoster({
  shiftId,
  volunteers,
  onChange,
}: {
  shiftId: string;
  volunteers: Volunteer[];
  onChange: () => void;
}) {
  const { showToast } = useToast();
  const [rows, setRows] = useState<ShiftAssignmentRow[] | null>(null);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await listShiftAssignments(shiftId);
    setRows(res.ok ? res.data : []);
  }, [shiftId]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = useCallback(
    async (fn: () => Promise<{ ok: boolean; error?: string }>, failTitle: string) => {
      setBusy(true);
      const res = await fn();
      setBusy(false);
      if (!res.ok) {
        showToast({ tone: "error", title: failTitle, description: res.error });
        return;
      }
      await load();
      onChange();
    },
    [load, onChange, showToast],
  );

  const assigned = rows?.filter((r) => r.status === "ASSIGNED") ?? [];
  const requested = rows?.filter((r) => r.status === "REQUESTED") ?? [];
  const takenIds = new Set(rows?.map((r) => r.volunteer.id));
  const available = volunteers.filter((v) => !takenIds.has(v.id));

  return (
    <div className="mt-2 space-y-3 rounded-xl border border-border bg-surface-variant/40 p-3">
      {requested.length > 0 ? (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pending requests</p>
          <ul className="space-y-1">
            {requested.map((r) => (
              <li key={r.assignmentId} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-foreground">{r.volunteer.name}</span>
                <span className="flex gap-1">
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => approveShiftRequest(r.assignmentId), "Couldn't approve")}>
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => denyShiftRequest(r.assignmentId), "Couldn't deny")}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Assigned ({assigned.length})
        </p>
        {assigned.length === 0 ? (
          <p className="text-sm text-muted-foreground">No one assigned yet.</p>
        ) : (
          <ul className="space-y-1">
            {assigned.map((r) => (
              <li key={r.assignmentId} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-foreground">{r.volunteer.name}</span>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => releaseShiftAssignment(r.assignmentId), "Couldn't release")}>
                  Release
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Select value={pick} onValueChange={setPick} placeholder="Assign a volunteer…" aria-label="Assign a volunteer">
            {available.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.displayName}
              </SelectItem>
            ))}
          </Select>
        </div>
        <Button
          size="sm"
          disabled={busy || !pick}
          onClick={() =>
            act(async () => {
              const res = await assignShift(shiftId, pick);
              if (res.ok) setPick("");
              return res;
            }, "Couldn't assign")
          }
        >
          <UserPlus className="mr-1.5 h-4 w-4" />
          Assign
        </Button>
      </div>
    </div>
  );
}
