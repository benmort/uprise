"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BellPlus, CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
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
import { SearchInput } from "@/components/ui/search-input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NewConversationMenu } from "@/components/inbox/new-conversation-menu";
import { createBlastAndOpen } from "@/lib/blasts";
import "./calendar.css";

/**
 * The calendar surface, replicated 1:1 from the approved design mock
 * (Downloads/Calendar.html): one visual language — category-tinted pills on a
 * token-driven month grid, card columns for the week, a tinted list for the
 * day — replacing the FullCalendar look that clashed with the shell. The grid
 * is hand-rolled (pure date math); behaviours are unchanged: real
 * entries/events/shifts, kind filters + search, click-through per kind, and
 * every add action opens the "Start a new conversation" picker.
 */

// The mock's category palette: accent + light/dark text per kind.
type CatStyle = { accent: string; textL: string; textD: string; icon: string; label: string };
const CAT: Record<CalendarItemKind, CatStyle> = {
  event: { accent: "#10b981", textL: "#047857", textD: "#6ee7b7", icon: "📣", label: "Event" },
  shift: { accent: "#465fff", textL: "#2a31d8", textD: "#aeb8ff", icon: "🧭", label: "Shift" },
  entry: { accent: "#f43f5e", textL: "#be123c", textD: "#fda4af", icon: "🔔", label: "Reminder" },
};

// Entries may carry a stored colour — mapped onto the same tinting scheme so a
// coloured reminder keeps its meaning inside the mock's visual language.
const ENTRY_COLOR: Record<EventColor, Pick<CatStyle, "accent" | "textL" | "textD">> = {
  danger: { accent: "#f43f5e", textL: "#be123c", textD: "#fda4af" },
  success: { accent: "#10b981", textL: "#047857", textD: "#6ee7b7" },
  primary: { accent: "#465fff", textL: "#2a31d8", textD: "#aeb8ff" },
  warning: { accent: "#f59e0b", textL: "#b45309", textD: "#fcd34d" },
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WD_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WD_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_PER_CELL = 3;

type YMD = { y: number; m: number; d: number };
type CalView = "month" | "week" | "day";

const toYMD = (date: Date): YMD => ({ y: date.getFullYear(), m: date.getMonth(), d: date.getDate() });
const addDays = (f: YMD, n: number): YMD => toYMD(new Date(f.y, f.m, f.d + n));
const sameDay = (a: YMD, b: YMD) => a.y === b.y && a.m === b.m && a.d === b.d;
const fmtLong = (f: YMD) => `${f.d} ${MONTHS[f.m]} ${f.y}`;

const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false });

function timeLabel(item: CalendarItem): string {
  if (item.allDay) return "All day";
  const start = hhmm(item.startsAt);
  return item.endsAt ? `${start} – ${hhmm(item.endsAt)}` : start;
}

/** The inline custom props a pill/card/badge needs (`--acc`/`--txl`/`--txd`). */
function tintVars(item: CalendarItem): React.CSSProperties {
  const base =
    item.kind === "entry" && item.color && ENTRY_COLOR[item.color as EventColor]
      ? ENTRY_COLOR[item.color as EventColor]
      : CAT[item.kind];
  return { "--acc": base.accent, "--txl": base.textL, "--txd": base.textD } as React.CSSProperties;
}

type KindFilter = CalendarItemKind | "comms";
const FILTERS: { key: KindFilter; label: string; disabled?: boolean }[] = [
  { key: "entry", label: "Entries" },
  { key: "event", label: "Events" },
  { key: "shift", label: "Shifts" },
];

const VIEWS: { key: CalView; label: string }[] = [
  { key: "month", label: "Month" },
  { key: "week", label: "Week" },
  { key: "day", label: "Day" },
];

export default function CalendarPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const today = useMemo(() => toYMD(new Date()), []);

  const [view, setView] = useState<CalView>("month");
  const [cursor, setCursor] = useState<{ y: number; m: number }>({ y: today.y, m: today.m });
  const [focus, setFocus] = useState<YMD>(today);
  const [shown, setShown] = useState<Set<CalendarItemKind>>(new Set(["entry", "event", "shift"]));
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [editing, setEditing] = useState<EventFormData | undefined>();
  // Any add gesture opens the "Start a new conversation" picker (not a direct add).
  const [convoOpen, setConvoOpen] = useState(false);
  // The mock's 165ms grid fade on navigation/view changes.
  const [gridFx, setGridFx] = useState<{ opacity: number; transform: string }>({ opacity: 1, transform: "none" });
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data, loading, error, noPermission, refetch } = useApi("/calendar", () => listCalendar(), {
    ttlMs: 15_000,
  });

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter((i) => shown.has(i.kind) && (!q || i.title.toLowerCase().includes(q)));
  }, [data, shown, query]);

  const eventsOn = useCallback(
    (y: number, m: number, d: number) =>
      items
        .filter((i) => sameDay(toYMD(new Date(i.startsAt)), { y, m, d }))
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    [items],
  );

  const fade = useCallback((fn: () => void) => {
    setGridFx({ opacity: 0, transform: "translateY(6px)" });
    if (fadeTimer.current) clearTimeout(fadeTimer.current);
    fadeTimer.current = setTimeout(() => {
      fn();
      setGridFx({ opacity: 1, transform: "none" });
    }, 165);
  }, []);

  const step = (dir: -1 | 1) =>
    fade(() => {
      if (view === "month") {
        setCursor(({ y, m }) => {
          let nm = m + dir;
          let ny = y;
          if (nm < 0) { nm = 11; ny--; }
          if (nm > 11) { nm = 0; ny++; }
          return { y: ny, m: nm };
        });
      } else if (view === "week") setFocus((f) => addDays(f, 7 * dir));
      else setFocus((f) => addDays(f, dir));
    });

  const goToday = () =>
    fade(() => {
      setCursor({ y: today.y, m: today.m });
      setFocus(today);
    });

  const changeView = (v: CalView) => fade(() => setView(v));
  const openDay = (day: YMD) => fade(() => { setView("day"); setFocus(day); });

  const toggle = (kind: CalendarItemKind) =>
    setShown((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });

  // Click-through: events → their detail, shifts → their campaign's shift roster, entries → edit.
  const openItem = useCallback(
    (item: CalendarItem) => {
      if (item.kind === "event") {
        router.push(`/canvass/events/${item.id}`);
        return;
      }
      if (item.kind === "shift") {
        const campaignId = item.meta?.campaignId as string | undefined;
        router.push(campaignId ? `/canvass/${campaignId}/shifts` : "/canvass/shifts");
        return;
      }
      setModalMode("edit");
      setEditing({
        id: item.id,
        title: item.title,
        startDate: item.startsAt,
        endDate: item.endsAt ?? "",
        color: (item.color as EventColor) ?? "warning",
      });
      setModalOpen(true);
    },
    [router],
  );

  // Reminders keep a direct-add path (the picker has no reminder channel).
  const openReminderAdd = useCallback((day?: YMD) => {
    const at = day ?? focus;
    setModalMode("add");
    setEditing({ title: "", startDate: new Date(at.y, at.m, at.d).toISOString(), endDate: "", color: "warning" });
    setModalOpen(true);
  }, [focus]);

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

  // ── period label ──────────────────────────────────────────────────────────
  const weekRange = (f: YMD) => {
    const off = new Date(f.y, f.m, f.d).getDay();
    const s = addDays(f, -off);
    const e = addDays(f, 6 - off);
    if (s.m === e.m) return `${s.d} – ${e.d} ${MON[s.m]} ${s.y}`;
    if (s.y === e.y) return `${s.d} ${MON[s.m]} – ${e.d} ${MON[e.m]} ${s.y}`;
    return `${s.d} ${MON[s.m]} ${s.y} – ${e.d} ${MON[e.m]} ${e.y}`;
  };
  const periodLabel =
    view === "month"
      ? `${MONTHS[cursor.m]} ${cursor.y}`
      : view === "week"
        ? weekRange(focus)
        : `${WD_FULL[new Date(focus.y, focus.m, focus.d).getDay()]}, ${fmtLong(focus)}`;

  // ── month grid model ──────────────────────────────────────────────────────
  const monthDays = useMemo(() => {
    const { y, m } = cursor;
    const startOff = new Date(y, m, 1).getDay();
    const last = new Date(y, m + 1, 0).getDate();
    const rows = Math.ceil((startOff + last) / 7);
    return Array.from({ length: rows * 7 }, (_, i) => {
      const dt = new Date(y, m, 1 - startOff + i);
      const day = toYMD(dt);
      const dow = dt.getDay();
      return {
        day,
        inMonth: day.m === m && day.y === y,
        weekend: dow === 0 || dow === 6,
        isToday: sameDay(day, today),
        items: eventsOn(day.y, day.m, day.d),
      };
    });
  }, [cursor, eventsOn, today]);

  // ── week columns model ────────────────────────────────────────────────────
  const weekColumns = useMemo(() => {
    const off = new Date(focus.y, focus.m, focus.d).getDay();
    return Array.from({ length: 7 }, (_, i) => {
      const day = addDays(focus, -off + i);
      return {
        day,
        weekday: WD_SHORT[new Date(day.y, day.m, day.d).getDay()],
        isToday: sameDay(day, today),
        items: eventsOn(day.y, day.m, day.d),
      };
    });
  }, [focus, eventsOn, today]);

  const dayItems = useMemo(() => eventsOn(focus.y, focus.m, focus.d), [eventsOn, focus]);

  return (
    <PageShell
      icon={CalendarDays}
      title="Calendar"
      description="Everything scheduled in one place — shifts, events and your own reminders. Select an item to open it."
    >
      {/* Kind filter chips + search — the mock's pill chips (primary-filled when on). */}
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => {
          const kind = f.key as CalendarItemKind;
          const on = shown.has(kind);
          const cat = CAT[kind];
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(kind)}
              className="inline-flex h-[34px] items-center gap-[7px] rounded-full px-3.5 text-[13.5px] font-semibold transition-all"
              style={{
                border: `1px solid ${on ? "transparent" : "hsl(var(--border))"}`,
                background: on ? "hsl(var(--primary))" : "hsl(var(--surface))",
                color: on ? "#fff" : "hsl(var(--muted-foreground))",
                boxShadow: on ? "0 4px 12px -4px rgba(70,95,255,.5)" : undefined,
              }}
            >
              <span
                aria-hidden
                className="h-2 w-2 rounded-full"
                style={{
                  background: on ? "#fff" : cat.accent,
                  boxShadow: on ? undefined : `0 0 0 2px color-mix(in srgb, ${cat.accent} 25%, transparent)`,
                }}
              />
              {f.label}
            </button>
          );
        })}
        <span aria-hidden className="mx-1 h-[22px] w-px bg-border" />
        <span className="inline-flex h-[34px] items-center gap-1.5 rounded-full border border-dashed border-border px-3 text-[13px] font-medium text-muted-foreground">
          Comms <span className="opacity-70">(soon)</span>
        </span>
        <SearchInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search titles…"
          aria-label="Search calendar"
          wrapperClassName="w-full sm:ml-auto sm:w-56"
        />
      </div>

      <StateRegion
        loading={loading}
        error={error}
        noPermission={noPermission}
        onRetry={() => void refetch()}
        skeleton={<Skeleton className="h-[560px] w-full rounded-2xl" />}
      >
        {/* The calendar card — 18px radius, layered shadow, everything inside. */}
        <div
          className="relative overflow-hidden rounded-[18px] border border-border bg-surface"
          style={{ boxShadow: "0 1px 2px rgba(16,24,40,.04), 0 12px 32px -18px rgba(16,24,40,.18)" }}
        >
          {/* Toolbar: prev/next + Today + add actions | period label | view switcher */}
          <div className="flex flex-wrap items-center justify-between gap-3.5 border-b border-border px-[18px] py-4">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-0.5 rounded-[11px] border border-border bg-surface-variant p-[3px]">
                <button
                  type="button"
                  aria-label="Previous"
                  onClick={() => step(-1)}
                  className="flex h-[34px] w-[34px] items-center justify-center rounded-lg text-foreground transition-colors hover:bg-surface"
                >
                  <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={2.4} />
                </button>
                <button
                  type="button"
                  aria-label="Next"
                  onClick={() => step(1)}
                  className="flex h-[34px] w-[34px] items-center justify-center rounded-lg text-foreground transition-colors hover:bg-surface"
                >
                  <ChevronRight className="h-[18px] w-[18px]" strokeWidth={2.4} />
                </button>
              </div>
              <button
                type="button"
                onClick={goToday}
                className="h-10 rounded-[10px] border border-border bg-surface px-4 text-sm font-semibold text-foreground transition-colors hover:border-primary"
              >
                Today
              </button>
              <Button className="h-10" onClick={() => setConvoOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" strokeWidth={2.4} /> Add event
              </Button>
              <button
                type="button"
                onClick={() => openReminderAdd()}
                title="New reminder"
                aria-label="New reminder"
                className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-border bg-surface text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              >
                <BellPlus className="h-4 w-4" />
              </button>
            </div>

            <h2 className="min-w-[200px] flex-1 text-center text-[22px] font-bold tracking-[-0.01em]">
              {periodLabel}
            </h2>

            <div className="flex items-center gap-0.5 rounded-[11px] border border-border bg-surface-variant p-[3px]">
              {VIEWS.map((v) => {
                const on = view === v.key;
                return (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => changeView(v.key)}
                    className={cn(
                      "h-[34px] rounded-lg px-4 text-sm font-semibold transition-all",
                      on ? "bg-surface text-primary" : "text-muted-foreground",
                    )}
                    style={on ? { boxShadow: "0 1px 3px rgba(16,24,40,.14)" } : undefined}
                  >
                    {v.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ opacity: gridFx.opacity, transform: gridFx.transform, transition: "opacity .17s ease, transform .17s ease" }}>
            {view === "month" && (
              <div>
                <div className="grid grid-cols-7 bg-surface">
                  {WD_SHORT.map((wd, i) => (
                    <div
                      key={wd}
                      className={cn(
                        "px-2.5 py-3 text-[12.5px] font-bold tracking-[0.02em] text-muted-foreground",
                        i > 0 && "border-l border-border",
                      )}
                    >
                      {wd}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-px border-t border-border bg-border">
                  {monthDays.map(({ day, inMonth, weekend, isToday, items: dayList }, i) => {
                    const shownItems = dayList.slice(0, MAX_PER_CELL);
                    const more = dayList.length - shownItems.length;
                    return (
                      <div
                        key={i}
                        className={cn(
                          "cal-cell min-h-[118px]",
                          isToday && "is-today",
                          !inMonth && "is-out",
                          inMonth && !isToday && weekend && "is-weekend",
                        )}
                      >
                        <div className="flex min-h-6 items-center justify-between gap-1">
                          {isToday ? (
                            <span className="cal-today-num">{day.d}</span>
                          ) : (
                            <span
                              className="px-[3px] py-px text-[13px] font-semibold"
                              style={{ color: inMonth ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))" }}
                            >
                              {day.d}
                            </span>
                          )}
                          {inMonth && (
                            <button
                              type="button"
                              aria-label="Add on this day"
                              className="cal-add-day"
                              onClick={() => setConvoOpen(true)}
                            >
                              <Plus className="h-3.5 w-3.5" strokeWidth={2.6} />
                            </button>
                          )}
                        </div>
                        <div className="mt-[3px] flex flex-col gap-[3px]">
                          {shownItems.map((item) => (
                            <button
                              key={`${item.kind}:${item.id}`}
                              type="button"
                              title={item.title}
                              className="cal-pill"
                              style={tintVars(item)}
                              onClick={() => openItem(item)}
                            >
                              <span className="text-xs leading-none">{CAT[item.kind].icon}</span>
                              <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{item.title}</span>
                            </button>
                          ))}
                          {more > 0 && (
                            <button
                              type="button"
                              className="self-start rounded-[5px] px-1.5 py-px text-[11.5px] font-semibold text-muted-foreground transition-colors hover:text-primary"
                              onClick={() => openDay(day)}
                            >
                              +{more} more
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {view === "week" && (
              <div className="grid grid-cols-7 gap-px bg-border">
                {weekColumns.map(({ day, weekday, isToday, items: colItems }) => (
                  <div key={`${day.m}-${day.d}`} className="flex min-h-[520px] flex-col bg-surface">
                    <div
                      className={cn(
                        "cal-weekhead flex items-center justify-between border-b border-border px-3 py-2.5",
                        isToday && "is-today",
                      )}
                    >
                      <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        {weekday}
                      </span>
                      {isToday ? (
                        <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-primary text-[13px] font-bold text-white">
                          {day.d}
                        </span>
                      ) : (
                        <span className="text-[15px] font-bold text-foreground">{day.d}</span>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-2 py-2.5">
                      {colItems.map((item) => (
                        <button
                          key={`${item.kind}:${item.id}`}
                          type="button"
                          className="cal-card"
                          style={tintVars(item)}
                          onClick={() => openItem(item)}
                        >
                          <span className="flex items-center gap-1 text-[10.5px] font-semibold opacity-85">
                            <span>{CAT[item.kind].icon}</span>
                            {timeLabel(item)}
                          </span>
                          <span className="text-[12.5px] font-semibold leading-[1.25]">{item.title}</span>
                        </button>
                      ))}
                      {colItems.length === 0 && (
                        <button
                          type="button"
                          className="mt-1 rounded-lg border border-dashed border-border p-2 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                          onClick={() => setConvoOpen(true)}
                        >
                          + Add
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {view === "day" && (
              <div className="mx-auto flex max-w-[720px] flex-col gap-3.5 px-5 pb-8 pt-6">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[13px] font-semibold text-muted-foreground">
                      {WD_FULL[new Date(focus.y, focus.m, focus.d).getDay()]}
                    </span>
                    <span className="text-xl font-bold text-foreground">{fmtLong(focus)}</span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {dayItems.length} {dayItems.length === 1 ? "item" : "items"}
                  </span>
                </div>
                {dayItems.map((item) => (
                  <button
                    key={`${item.kind}:${item.id}`}
                    type="button"
                    className="cal-row flex items-center gap-3.5 rounded-xl p-3.5 text-left"
                    style={tintVars(item)}
                    onClick={() => openItem(item)}
                  >
                    <span className="cal-badge" style={tintVars(item)}>
                      <span>{CAT[item.kind].icon}</span>
                      {CAT[item.kind].label}
                    </span>
                    <span className="w-28 shrink-0 text-[13px] font-semibold text-muted-foreground">
                      {timeLabel(item)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-semibold text-foreground">{item.title}</span>
                      {typeof item.meta?.location === "string" && item.meta.location && (
                        <span className="block truncate text-[12.5px] text-muted-foreground">{item.meta.location}</span>
                      )}
                    </span>
                  </button>
                ))}
                {dayItems.length === 0 && (
                  <button
                    type="button"
                    className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                    onClick={() => setConvoOpen(true)}
                  >
                    Nothing scheduled — add something
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </StateRegion>

      <EventModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        mode={modalMode}
        eventData={editing}
        onSave={handleSave}
      />

      <NewConversationMenu
        open={convoOpen}
        onClose={() => setConvoOpen(false)}
        onPick={(ch) => {
          if (ch === "event") router.push("/canvass/events");
          else if (ch === "sms") void createBlastAndOpen(router, showToast, { channel: "SMS" });
          else if (ch === "call") router.push("/channels/calls");
        }}
      />
    </PageShell>
  );
}
