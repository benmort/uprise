"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Minus, Plus } from "lucide-react";
import { Button, cn, useLocalStorage } from "@uprise/ui";
import { SectionCard } from "@uprise/ui";
import { KpiTile } from "@uprise/ui";
import {
  buildTurf,
  DENSITY_PRESETS,
  estimateTurf,
  formatHours,
  paceOf,
  PRIOR_ALLOWANCE,
  type Pace,
} from "../lib/turf-planner";

/** A four-hour shift – the reference session every density row is priced against. */
const REF_SHIFT_HOURS = 4;
/** The reference turf the density list is priced from: big enough to report a steady-state
 *  rate rather than a small-turf edge. */
const REF_ADDRESSES = 200;

const PACE_STYLES: Record<Pace, string> = {
  fast: "bg-success-container text-success",
  steady: "bg-surface-variant text-muted-foreground",
  slow: "bg-warning-container text-warning",
};
const PACE_LABEL: Record<Pace, string> = { fast: "Fast", steady: "Steady", slow: "Slow going" };

function PaceBadge({ pace, className }: { pace: Pace; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.05em]",
        PACE_STYLES[pace],
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {PACE_LABEL[pace]}
    </span>
  );
}

/**
 * A ± number control sized for a thumb. The phone equivalent of the desktop planner's
 * `<input type="number">`, whose spinners are unusable one-handed and whose keyboard
 * covers the very results you are trying to watch move.
 */
function Stepper({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, Number(n.toFixed(2))));
  return (
    <div>
      <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          disabled={value <= min}
          onClick={() => onChange(clamp(value - step))}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border text-foreground disabled:opacity-40"
        >
          <Minus className="h-5 w-5" />
        </button>
        <output
          aria-label={label}
          className="flex-1 text-center text-2xl font-extrabold tabular-nums text-foreground"
        >
          {display}
        </output>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          disabled={value >= max}
          onClick={() => onChange(clamp(value + step))}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border text-foreground disabled:opacity-40"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

/**
 * "Turf planner" for the phone – the canvasser-side twin of the organiser's desktop
 * `/canvass/planner`, running on the same shared model (`../lib/turf-planner`) so the two
 * can never quote different numbers.
 *
 * It is not the desktop page reflowed. A volunteer plans a *shift*, not a campaign, so the
 * answer ("you can realistically knock N doors") leads, the controls are thumb-sized steppers
 * rather than number inputs, the seven-column density table becomes a list, and the model's
 * workings collapse away behind a disclosure. `?campaignId=` (optional) turns the result into
 * an action: get or carve turf that size.
 */
export function TurfPlanner() {
  const router = useRouter();
  const params = useSearchParams();
  const campaignId = params.get("campaignId") ?? "";

  // Persisted: a canvasser's session length and patch barely change between shifts, so
  // re-planning next week should not mean re-entering them.
  const [densityId, setDensityId] = useLocalStorage("uprise.planner.density", DENSITY_PRESETS[1]!.id);
  const [addresses, setAddresses] = useLocalStorage("uprise.planner.addresses", 60);
  const [sessionHours, setSessionHours] = useLocalStorage("uprise.planner.sessionHours", 4);
  // Share of the session actually spent at doors – the rest is travel, briefing and breaks.
  const [effectivePct, setEffectivePct] = useLocalStorage("uprise.planner.effectivePct", 69);

  const density = DENSITY_PRESETS.find((d) => d.id === densityId) ?? DENSITY_PRESETS[1]!;

  const est = useMemo(() => {
    const turf = buildTurf(addresses, density.doorsPerBuilding, density.gapMetres);
    return estimateTurf(turf.buildings, turf.walkSeconds);
  }, [addresses, density]);

  const effFraction = effectivePct / 100;
  const effectiveHours = sessionHours * effFraction;
  const doorsPerHour = est.doorsPerHour;
  const ceiling = Math.round(doorsPerHour * sessionHours);
  const realistic = Math.round(doorsPerHour * effectiveHours);
  const conversations = Math.round(realistic * PRIOR_ALLOWANCE.answerRate);
  const pace = paceOf(doorsPerHour);

  const elapsedHours = effFraction > 0 ? est.totalSeconds / 3600 / effFraction : 0;
  const shifts = sessionHours > 0 ? elapsedHours / sessionHours : 0;
  // The turf is bigger than the shift when clearing it runs past the session.
  const oversized = shifts > 1.05;

  const reference = useMemo(
    () =>
      DENSITY_PRESETS.map((d) => {
        const t = buildTurf(REF_ADDRESSES, d.doorsPerBuilding, d.gapMetres);
        const rate = estimateTurf(t.buildings, t.walkSeconds).doorsPerHour;
        return { d, rate, realistic: Math.round(rate * REF_SHIFT_HOURS * 0.69), pace: paceOf(rate) };
      }),
    [],
  );

  // Where the seconds go, per door, in a plain suburban street.
  const breakdown = useMemo(() => {
    const t = buildTurf(60, 1, 15.9);
    const e = estimateTurf(t.buildings, t.walkSeconds);
    return [
      { label: "At the door – knock, log, talk", seconds: e.doorSeconds / e.doors, bar: "bg-primary" },
      { label: "Front path & back", seconds: e.approachWalkSeconds / e.doors, bar: "bg-success" },
      { label: "Walk to the next building", seconds: e.walkSeconds / e.doors, bar: "bg-foreground/30" },
    ];
  }, []);
  const breakdownTotal = breakdown.reduce((n, s) => n + s.seconds, 0);

  const spec: Array<[string, string]> = [
    ["Knock & wait", "45 s"],
    ["Log the outcome", "15 s"],
    ["Answer rate", "30%"],
    ["Conversation, when it happens", "180 s"],
    ["Front path & back / building", "25 m"],
    ["Lobby buzz / block", "60 s"],
    ["Locked out of a block", "35%"],
    ["Walking pace", "1.25 m/s"],
  ];

  return (
    <div className="space-y-5 pb-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Back"
          onClick={() => router.push("/")}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border text-foreground"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-extrabold">Turf planner</h1>
      </div>

      {/* The answer, first: what this shift realistically yields. */}
      <div className="rounded-3xl border border-border bg-surface p-5 shadow-card">
        <div className="flex items-baseline gap-2">
          <span className="text-5xl font-extrabold leading-none tabular-nums text-primary">{realistic}</span>
          <span className="text-lg font-bold text-foreground">doors</span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          in {formatHours(sessionHours)} of {density.label.toLowerCase()} – about{" "}
          <span className="font-semibold text-foreground tabular-nums">{conversations}</span> conversations.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <PaceBadge pace={pace} />
          <span className="text-xs text-muted-foreground tabular-nums">{doorsPerHour.toFixed(1)} doors/hr</span>
        </div>
      </div>

      <SectionCard title="Your shift" bodyClassName="px-5 py-5 space-y-6">
        <Stepper
          label="Session length"
          value={sessionHours}
          display={formatHours(sessionHours)}
          min={0.5}
          max={8}
          step={0.5}
          onChange={setSessionHours}
        />

        <div>
          <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
            Where you&apos;re knocking
          </span>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Turf density">
            {DENSITY_PRESETS.map((d) => {
              const active = d.id === density.id;
              return (
                <button
                  key={d.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setDensityId(d.id)}
                  className={cn(
                    "rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition",
                    active ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground",
                  )}
                >
                  {d.label}
                  <span
                    className={cn(
                      "mt-0.5 block text-[11px] font-normal",
                      active ? "text-primary-foreground/75" : "text-muted-foreground",
                    )}
                  >
                    {d.hint}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <Stepper
          label="Turf size · addresses"
          value={addresses}
          display={String(addresses)}
          min={5}
          max={600}
          step={5}
          onChange={setAddresses}
        />

        <div>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
              Time actually at doors
            </span>
            <span className="text-sm font-bold tabular-nums text-primary">{formatHours(effectiveHours)}</span>
          </div>
          <input
            type="range"
            min={40}
            max={100}
            step={1}
            value={effectivePct}
            onChange={(e) => setEffectivePct(Number(e.target.value))}
            aria-label="Percentage of the session spent at doors"
            className="h-6 w-full accent-primary"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            {effectivePct}% of {formatHours(sessionHours)} – the rest is getting there, briefing and breaks.
          </p>
        </div>
      </SectionCard>

      {/* How this turf sits against the shift you just described. */}
      <div
        className={cn(
          "rounded-2xl border p-4 text-sm",
          oversized ? "border-warning/40 bg-warning-container/40" : "border-border bg-surface-variant/50",
        )}
      >
        <p className="text-muted-foreground">
          Clearing all <span className="font-semibold tabular-nums text-foreground">{addresses}</span> addresses takes
          about <span className="font-semibold text-foreground">{formatHours(elapsedHours)}</span> on the ground
          {oversized ? (
            <>
              {" "}
              – <span className="font-semibold text-foreground tabular-nums">{shifts.toFixed(1)}</span> shifts of work.
              Cut it down so you finish what you start: a half-knocked list corrupts the data.
            </>
          ) : (
            <> – it fits inside one shift.</>
          )}
        </p>
        {oversized ? (
          <Button
            variant="outline"
            className="mt-3 h-11 w-full"
            onClick={() => setAddresses(Math.max(5, Math.round(realistic / 5) * 5))}
          >
            Size it to one shift ({Math.max(5, Math.round(realistic / 5) * 5)} addresses)
          </Button>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <KpiTile label="Doors / hour" value={doorsPerHour.toFixed(1)} />
        <KpiTile label="Ceiling · all session" value={ceiling} />
        <KpiTile
          className="border-primary/40"
          label="Realistic doors"
          value={<span className="text-primary">{realistic}</span>}
        />
        <KpiTile label="Conversations @ 30%" value={conversations} />
      </div>

      {campaignId ? (
        <div className="space-y-2.5">
          <Link href={`/get-turf?campaignId=${encodeURIComponent(campaignId)}`} className="block">
            <Button className="h-12 w-full text-base">Find turf this size</Button>
          </Link>
          <Link href={`/carve-turf?campaignId=${encodeURIComponent(campaignId)}`} className="block">
            <Button variant="outline" className="h-12 w-full text-base">
              Carve my own
            </Button>
          </Link>
        </div>
      ) : null}

      <SectionCard title="How fast different places knock" bodyClassName="p-0">
        <ul className="divide-y divide-border">
          {reference.map((r) => (
            <li key={r.d.id} className="flex items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{r.d.label}</p>
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  {r.rate.toFixed(1)} /hr · ~{r.realistic} doors in {REF_SHIFT_HOURS} h
                </p>
              </div>
              <PaceBadge pace={r.pace} />
            </li>
          ))}
        </ul>
      </SectionCard>

      <p className="text-sm leading-relaxed text-muted-foreground">
        Terrace and detached suburban knock at almost the same rate: the ~114 seconds at each door dwarfs the short walk
        between them. Density only bites two ways – a rural spread, where the walk finally dominates, and an apartment
        tower, where one approach is amortised over forty doors (though a third sit behind locked lobbies).
      </p>

      {/* The workings – collapsed by default; a phone screen is for the answer. */}
      <details className="overflow-hidden rounded-2xl border border-border bg-surface">
        <summary className="cursor-pointer list-none px-5 py-4 text-sm font-bold text-foreground marker:hidden">
          How this is worked out
        </summary>
        <div className="space-y-5 border-t border-border px-5 py-4">
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
              Where the seconds go, per door
            </p>
            <div className="flex h-7 overflow-hidden rounded-lg border border-border">
              {breakdown.map((s) => (
                <div key={s.label} className={s.bar} style={{ width: `${(100 * s.seconds) / breakdownTotal}%` }} aria-hidden />
              ))}
            </div>
            <ul className="mt-3 space-y-2">
              {breakdown.map((s) => (
                <li key={s.label} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                  <span className={cn("h-3 w-3 shrink-0 rounded", s.bar)} />
                  <span className="min-w-0 flex-1">{s.label}</span>
                  <span className="shrink-0 font-mono tabular-nums text-foreground">{s.seconds.toFixed(0)} s</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">Model priors</p>
            <dl className="divide-y divide-border rounded-xl border border-border">
              {spec.map(([name, val]) => (
                <div key={name} className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-sm">
                  <dt className="text-muted-foreground">{name}</dt>
                  <dd className="shrink-0 font-mono font-bold tabular-nums text-foreground">{val}</dd>
                </div>
              ))}
            </dl>
          </div>

          <p className="text-[13px] leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground">These are forecasts, not measurements.</span> Every constant
            is a literature prior tuned to reproduce the manuals&apos; bands (15–27 doors/hr urban, 10–15 low-density).
            Once your knocks have real timings behind them, the measured seconds-per-door replace these priors.
          </p>
        </div>
      </details>
    </div>
  );
}
