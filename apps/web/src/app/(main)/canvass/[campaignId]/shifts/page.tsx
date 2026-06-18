"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, CalendarPlus, MapPin, Trash2 } from "lucide-react";
import { createShift, deleteShift, listShifts, type Shift } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionCard } from "@/components/canvass/section-card";
import { useToast } from "@/components/ui/toast";

export default function ShiftsPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const { showToast } = useToast();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await listShifts(campaignId);
    if (res.ok) setShifts(res.data);
    setLoading(false);
  }, [campaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = useCallback(async () => {
    if (!name.trim() || !startsAt || !endsAt) {
      showToast({ tone: "warning", title: "Fill name, start and end" });
      return;
    }
    setBusy(true);
    const res = await createShift({
      campaignId,
      name: name.trim(),
      startsAt: new Date(startsAt).toISOString(),
      endsAt: new Date(endsAt).toISOString(),
      location: location.trim() || undefined,
    });
    setBusy(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't add shift", description: res.error });
      return;
    }
    setName("");
    setLocation("");
    setStartsAt("");
    setEndsAt("");
    await load();
  }, [campaignId, name, location, startsAt, endsAt, load, showToast]);

  const remove = useCallback(
    async (id: string) => {
      const res = await deleteShift(id);
      if (res.ok) await load();
    },
    [load],
  );

  return (
    <div className="page-stack">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/canvass">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Canvass
          </Link>
        </Button>
        <h1 className="text-2xl font-extrabold">Shifts</h1>
      </div>

      <SectionCard title="Schedule a shift">
        <div className="grid gap-2 sm:grid-cols-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Shift name" />
          <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Staging location" />
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Starts</label>
            <Input value={startsAt} onChange={(e) => setStartsAt(e.target.value)} type="datetime-local" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Ends</label>
            <Input value={endsAt} onChange={(e) => setEndsAt(e.target.value)} type="datetime-local" />
          </div>
        </div>
        <Button className="mt-3" onClick={add} disabled={busy}>
          <CalendarPlus className="mr-1.5 h-4 w-4" />
          Add shift
        </Button>
      </SectionCard>

      {loading ? (
        <Skeleton className="h-32 w-full" />
      ) : shifts.length === 0 ? (
        <SectionCard title="Upcoming shifts">
          <p className="text-sm text-muted-foreground">No shifts scheduled.</p>
        </SectionCard>
      ) : (
        <SectionCard title={`Upcoming shifts (${shifts.length})`}>
          <ul className="space-y-2">
            {shifts.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2">
                <div>
                  <p className="text-sm font-semibold text-foreground">{s.name}</p>
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    {new Date(s.startsAt).toLocaleString()} – {new Date(s.endsAt).toLocaleTimeString()}
                    {s.location ? (
                      <span className="flex items-center gap-0.5">
                        <MapPin className="h-3 w-3" />
                        {s.location}
                      </span>
                    ) : null}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Delete shift"
                  onClick={() => remove(s.id)}
                  className="text-muted-foreground hover:text-error"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}
