"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";
import type { EventInput } from "@fullcalendar/core";
import FullCalendarComponent from "@/components/prog/full-calendar";
import EventModal, { type EventColor, type EventFormData } from "@/components/prog/calendar/EventModal";
import {
  listCalendar,
  createCalendarEntry,
  updateCalendarEntry,
  type CalendarItem,
  type CalendarItemKind,
} from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { PageShell } from "@/components/shell/page-shell";
import { StateRegion } from "@/components/shell/state-region";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";

const HEX: Record<EventColor, { bg: string; border: string }> = {
  danger: { bg: "#ef4444", border: "#dc2626" },
  success: { bg: "#22c55e", border: "#16a34a" },
  primary: { bg: "#3b82f6", border: "#2563eb" },
  warning: { bg: "#f59e0b", border: "#d97706" },
};

// One colour per kind so the calendar reads at a glance: events green, shifts blue,
// generic entries amber (entries may override with their own stored colour).
const KIND_COLOR: Record<CalendarItemKind, EventColor> = {
  event: "success",
  shift: "primary",
  entry: "warning",
};

type KindFilter = CalendarItemKind | "comms";
const FILTERS: { key: KindFilter; label: string; disabled?: boolean }[] = [
  { key: "entry", label: "Entries" },
  { key: "event", label: "Events" },
  { key: "shift", label: "Shifts" },
  { key: "comms", label: "Comms (soon)", disabled: true },
];

function itemToFullCalendar(item: CalendarItem): EventInput {
  const color = (item.kind === "entry" && (item.color as EventColor)) || KIND_COLOR[item.kind];
  const hex = HEX[color] ?? HEX.primary;
  return {
    id: `${item.kind}:${item.id}`,
    title: item.kind === "shift" ? `🧭 ${item.title}` : item.kind === "event" ? `📣 ${item.title}` : item.title,
    start: item.startsAt,
    end: item.endsAt ?? undefined,
    allDay: item.allDay,
    backgroundColor: hex.bg,
    borderColor: hex.border,
    extendedProps: { kind: item.kind, entityId: item.id, color, meta: item.meta },
  };
}

export default function CalendarPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { data, loading, error, noPermission, refetch } = useApi("/calendar", () => listCalendar(), {
    ttlMs: 15_000,
  });
  const items: CalendarItem[] = data ?? [];

  const [shown, setShown] = useState<Set<CalendarItemKind>>(new Set(["entry", "event", "shift"]));
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [editing, setEditing] = useState<EventFormData | undefined>();

  const events = useMemo(
    () => items.filter((i) => shown.has(i.kind)).map(itemToFullCalendar),
    [items, shown],
  );

  const toggle = (kind: CalendarItemKind) =>
    setShown((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });

  const openAdd = useCallback((startDate = "", endDate = "") => {
    setModalMode("add");
    setEditing({ title: "", startDate, endDate, color: "warning" });
    setModalOpen(true);
  }, []);

  const handleDateSelect = useCallback(
    (info: Record<string, unknown>) => {
      const api = (info.view as { calendar: { unselect: () => void } }).calendar;
      api.unselect();
      openAdd(info.startStr as string, info.endStr as string);
    },
    [openAdd],
  );

  // Click-through: events → their detail, shifts → their campaign's shift roster, entries → edit.
  const handleEventClick = useCallback(
    (info: Record<string, unknown>) => {
      const ev = info.event as { extendedProps: { kind: CalendarItemKind; entityId: string; color?: EventColor; meta?: Record<string, unknown> }; title: string; startStr: string; endStr: string };
      const { kind, entityId, meta } = ev.extendedProps;
      if (kind === "event") {
        router.push(`/canvass/events/${entityId}`);
        return;
      }
      if (kind === "shift") {
        const campaignId = meta?.campaignId as string | undefined;
        router.push(campaignId ? `/canvass/${campaignId}/shifts` : "/canvass/shifts");
        return;
      }
      setModalMode("edit");
      setEditing({
        id: entityId,
        title: ev.title,
        startDate: ev.startStr,
        endDate: ev.endStr,
        color: ev.extendedProps.color ?? "warning",
      });
      setModalOpen(true);
    },
    [router],
  );

  // Only generic entries persist a drag/resize; events + shifts are read-only overlays.
  const handleEventChange = useCallback(
    async (info: Record<string, unknown>) => {
      const ev = info.event as { extendedProps: { kind: CalendarItemKind; entityId: string }; startStr: string; endStr: string };
      if (ev.extendedProps.kind !== "entry") {
        (info.revert as (() => void) | undefined)?.();
        return;
      }
      await updateCalendarEntry(ev.extendedProps.entityId, {
        startsAt: ev.startStr,
        endsAt: ev.endStr || undefined,
      });
      void refetch();
    },
    [refetch],
  );

  const handleSave = useCallback(
    async (form: EventFormData) => {
      const payload = {
        title: form.title,
        color: form.color,
        startsAt: form.startDate,
        endsAt: form.endDate || undefined,
      };
      const res = form.id ? await updateCalendarEntry(form.id, payload) : await createCalendarEntry(payload);
      if (!res.ok) {
        showToast({ tone: "error", title: "Couldn't save entry", description: res.error });
        return;
      }
      setModalOpen(false);
      void refetch();
    },
    [refetch, showToast],
  );

  return (
    <PageShell
      icon={CalendarDays}
      title="Calendar"
      description="Everything scheduled in one place — shifts, events and your own reminders. Click an item to open it."
    >
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => {
          const active = f.key !== "comms" && shown.has(f.key);
          return (
            <button
              key={f.key}
              type="button"
              disabled={f.disabled}
              onClick={() => f.key !== "comms" && toggle(f.key)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                f.disabled
                  ? "cursor-not-allowed border-dashed border-border text-muted-foreground opacity-60"
                  : active
                    ? "border-primary bg-primary-container text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      <StateRegion
        loading={loading}
        error={error}
        noPermission={noPermission}
        onRetry={() => void refetch()}
        skeleton={<Skeleton className="h-[520px] w-full rounded-2xl" />}
      >
        <div className="rounded-2xl border border-border bg-surface p-2 shadow-sm">
          <FullCalendarComponent
            events={events}
            onDateSelect={handleDateSelect}
            onEventClick={handleEventClick}
            onEventChange={handleEventChange}
            onAddEventClick={() => openAdd()}
            initialView="dayGridMonth"
            height="auto"
            className="w-full"
          />
        </div>
      </StateRegion>

      <EventModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        mode={modalMode}
        eventData={editing}
        onSave={handleSave}
      />
    </PageShell>
  );
}
