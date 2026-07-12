"use client";

import { useMemo, useState } from "react";
import { Route } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { SectionCard, KpiTile } from "@uprise/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  buildTurf,
  DENSITY_PRESETS,
  estimateTurf,
  formatHours,
  paceOf,
  PRIOR_ALLOWANCE,
  type DensityPreset,
  type Pace,
} from "@/lib/canvass/turf-planner";

// The reference table + door breakdown are computed once, off a fixed 200-address turf so
// each row reports the steady-state rate rather than a small-turf edge.
const REF_ADDRESSES = 200;
const REF_EFFECTIVE = 0.69;

const PACE_STYLES: Record<Pace, string> = {
  fast: "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]",
  steady: "bg-surface-variant text-muted-foreground",
  slow: "bg-[hsl(var(--warning-foreground))]/10 text-[hsl(var(--warning-foreground))]",
};
const PACE_LABEL: Record<Pace, string> = { fast: "Fast", steady: "Steady", slow: "Slow going" };

function PaceBadge({ pace }: { pace: Pace }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.05em]",
        PACE_STYLES[pace],
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {PACE_LABEL[pace]}
    </span>
  );
}

export default function TurfPlannerPage() {
  const [density, setDensity] = useState<DensityPreset>(DENSITY_PRESETS[1]!); // detached suburban
  const [addresses, setAddresses] = useState(60);
  const [sessionHours, setSessionHours] = useState(4);
  const [effectivePct, setEffectivePct] = useState(69); // % of the session actually at doors

  const est = useMemo(() => {
    const turf = buildTurf(addresses, density.doorsPerBuilding, density.gapMetres);
    return estimateTurf(turf.buildings, turf.walkSeconds);
  }, [addresses, density]);

  const effFraction = effectivePct / 100;
  const effectiveHours = sessionHours * effFraction;
  const doorsPerHour = est.doorsPerHour;
  const ceiling = Math.round(doorsPerHour * sessionHours);
  const realistic = Math.round(doorsPerHour * effectiveHours);
  const conversations = Math.round(doorsPerHour * effectiveHours * PRIOR_ALLOWANCE.answerRate);
  const pace = paceOf(doorsPerHour);

  const elapsedHours = est.totalSeconds / 3600 / effFraction;
  const shifts = sessionHours > 0 ? elapsedHours / sessionHours : 0;

  const reference = useMemo(
    () =>
      DENSITY_PRESETS.map((d) => {
        const t = buildTurf(REF_ADDRESSES, d.doorsPerBuilding, d.gapMetres);
        const rate = estimateTurf(t.buildings, t.walkSeconds).doorsPerHour;
        return {
          d,
          rate,
          ceiling: Math.round(rate * 4),
          realistic: Math.round(rate * 4 * REF_EFFECTIVE),
          pace: paceOf(rate),
        };
      }),
    [],
  );

  // Where the seconds go, per door, in a plain suburban street.
  const breakdown = useMemo(() => {
    const t = buildTurf(60, 1, 15.9);
    const e = estimateTurf(t.buildings, t.walkSeconds);
    return [
      { label: "At the door — knock, log, talk", seconds: e.doorSeconds / e.doors, bar: "bg-primary" },
      { label: "Front path & back", seconds: e.approachWalkSeconds / e.doors, bar: "bg-[hsl(var(--success))]" },
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

  const rules = [
    ["Cut turf to one realistic shift.", "Size it to the effective-time count, not the ceiling — a half-knocked list corrupts your contact data."],
    ["Density is a walking lever, not a knocking one.", "Flex turf size for rural spread and apartment blocks; leave terrace and suburban turf about the same."],
    ["Time the shift for when people are home.", "Weekday 4–7pm and weekend mornings lift the 30% answer rate — fewer doors, more conversations."],
    ["Reconcile attempted vs contacted after.", "Feed the real numbers back so the next plan is calibrated on your streets, not the priors."],
  ];

  return (
    <div className="page-stack">
      <PageHeader
        icon={Route}
        title="Turf planner"
        description="Size turf and set door goals by density — built up the way an organiser estimates: the walk between buildings, the path to each door, then the seconds at the door."
      />

      {/* ── Controls ── */}
      <SectionCard title="Plan a shift" description="A hypothetical turf priced from the same model that estimates a real one.">
        <div className="space-y-6">
          <div>
            <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">Density</span>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Turf density">
              {DENSITY_PRESETS.map((d) => {
                const active = d.id === density.id;
                return (
                  <button
                    key={d.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setDensity(d)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left text-sm font-semibold transition",
                      active
                        ? "border-primary bg-primary text-white"
                        : "border-border text-foreground hover:border-primary/50 hover:bg-surface-variant",
                    )}
                  >
                    {d.label}
                    <span className={cn("block text-[11px] font-normal tabular-nums", active ? "text-white/75" : "text-muted-foreground")}>
                      {d.doorsPerBuilding} doors · {d.gapMetres} m · {d.hint}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">Turf size · addresses</span>
              <Input
                type="number"
                min={5}
                max={600}
                step={5}
                value={addresses}
                onChange={(e) => setAddresses(Math.max(1, Number(e.target.value) || 0))}
                className="tabular-nums"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">Session length · hours</span>
              <Input
                type="number"
                min={1}
                max={8}
                step={0.5}
                value={sessionHours}
                onChange={(e) => setSessionHours(Math.max(0.5, Number(e.target.value) || 0))}
                className="tabular-nums"
              />
            </label>
          </div>

          <div>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">Time actually at doors</span>
              <span className="text-sm font-bold tabular-nums text-primary">
                {formatHours(effectiveHours)} <span className="font-medium text-muted-foreground">of {formatHours(sessionHours)}</span>
              </span>
            </div>
            <input
              type="range"
              min={40}
              max={100}
              step={1}
              value={effectivePct}
              onChange={(e) => setEffectivePct(Number(e.target.value))}
              aria-label="Percentage of the session spent at doors"
              className="w-full accent-primary"
            />
            <div className="mt-1 flex justify-between text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <span>All overhead</span>
              <span>The honest planning number</span>
              <span>No overhead</span>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* ── Results ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          label="Productive rate"
          value={<>{doorsPerHour.toFixed(1)}<span className="text-base font-bold text-muted-foreground"> /hr</span></>}
        />
        <KpiTile label="Ceiling · full session at doors" value={ceiling} />
        <KpiTile
          className="border-primary/40 bg-primary/[0.03]"
          label="Realistic doors this shift"
          value={<span className="text-primary">{realistic}</span>}
        />
        <KpiTile
          label="Likely conversations"
          value={<>{conversations}<span className="text-base font-bold text-muted-foreground"> @ 30%</span></>}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface-variant/50 px-4 py-3 text-sm text-muted-foreground">
        <PaceBadge pace={pace} />
        <span>
          Clearing this <span className="font-semibold tabular-nums text-foreground">{addresses}</span>-address turf is about{" "}
          <span className="font-semibold text-foreground">{formatHours(elapsedHours)}</span> on the ground — roughly{" "}
          <span className="font-semibold tabular-nums text-foreground">{shifts < 1.05 ? "one" : shifts.toFixed(1)}</span>{" "}
          shift{shifts < 1.05 ? "" : "s"} of {formatHours(sessionHours)}.
        </span>
      </div>

      {/* ── Density reference ── */}
      <SectionCard title="Density reference" description="A four-hour shift, same model." bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-[0.04em] text-muted-foreground">
                <th className="px-5 py-3 text-left font-semibold">Setting</th>
                <th className="px-5 py-3 text-right font-semibold">Doors / bldg</th>
                <th className="px-5 py-3 text-right font-semibold">Rate</th>
                <th className="px-5 py-3 text-right font-semibold">Ceiling / 4h</th>
                <th className="px-5 py-3 text-right font-semibold">Realistic / 4h</th>
                <th className="px-5 py-3 text-right font-semibold">Turf / shift</th>
                <th className="px-5 py-3 text-right font-semibold">Pace</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {reference.map((r) => (
                <tr key={r.d.id} className="border-b border-border last:border-0 hover:bg-surface-variant/40">
                  <td className="px-5 py-3">
                    <span className="font-semibold text-foreground">{r.d.label}</span>
                    <span className="block text-[11px] font-normal text-muted-foreground">
                      {r.d.gapMetres} m gap · {r.d.hint}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right text-muted-foreground">{r.d.doorsPerBuilding}</td>
                  <td className="px-5 py-3 text-right text-muted-foreground">{r.rate.toFixed(1)} /hr</td>
                  <td className="px-5 py-3 text-right text-muted-foreground">{r.ceiling}</td>
                  <td className="px-5 py-3 text-right font-bold text-primary">{r.realistic}</td>
                  <td className="px-5 py-3 text-right text-muted-foreground">~{r.realistic} addrs</td>
                  <td className="px-5 py-3 text-right"><PaceBadge pace={r.pace} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <p className="max-w-[70ch] text-sm text-muted-foreground">
        The surprise for most organisers: <span className="font-semibold text-foreground">terrace and detached suburban knock at almost the same rate</span>.
        The 114 seconds at each door dwarfs the short walk between them, so density barely moves the needle in ordinary streets. It only bites two ways —
        a <span className="font-semibold text-foreground">rural spread</span>, where the walk finally dominates, and an{" "}
        <span className="font-semibold text-foreground">apartment tower</span>, where one approach is amortised over forty doors (though a third sit behind locked lobbies).
      </p>

      {/* ── Where the seconds go ── */}
      <SectionCard title="Where the seconds go" description="One door in a plain suburban street.">
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <div className="flex h-8 overflow-hidden rounded-lg border border-border">
              {breakdown.map((s) => (
                <div key={s.label} className={s.bar} style={{ width: `${(100 * s.seconds) / breakdownTotal}%` }} aria-hidden />
              ))}
            </div>
            <ul className="mt-4 space-y-2">
              {breakdown.map((s) => (
                <li key={s.label} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                  <span className={cn("h-3 w-3 shrink-0 rounded", s.bar)} />
                  <span>{s.label}</span>
                  <span className="ml-auto font-mono tabular-nums text-foreground">{s.seconds.toFixed(0)} s</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 max-w-[52ch] text-sm text-muted-foreground">
              The door itself is the tax — knock, wait and log run whether or not anyone answers, and the walk only rules the estimate out in the country.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-surface-variant/30">
            <div className="border-b border-border px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
              Model priors
            </div>
            <dl className="divide-y divide-border">
              {spec.map(([name, val]) => (
                <div key={name} className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-sm">
                  <dt className="text-muted-foreground">{name}</dt>
                  <dd className="font-mono font-bold tabular-nums text-foreground">{val}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </SectionCard>

      {/* ── Rules of thumb ── */}
      <div className="grid gap-3 sm:grid-cols-2">
        {rules.map(([title, body]) => (
          <div key={title} className="rounded-xl border border-border border-l-[3px] border-l-primary bg-surface p-4 shadow-card">
            <h3 className="text-sm font-bold text-foreground">{title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{body}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-dashed border-border bg-surface-variant/40 px-5 py-4 text-sm leading-relaxed text-muted-foreground">
        <span className="font-semibold text-foreground">These are forecasts, not measurements.</span> Every constant is a literature prior tuned to reproduce
        the manuals&apos; bands (15–27 doors/hr urban, 10–15 low-density). The moment{" "}
        <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-xs text-foreground">canvass.DoorKnock</code> has rows, the real seconds-per-door and
        seconds-of-walking replace these priors and each figure stops being a guess. The pre-cut estimate on the turf page assumes ~100 doors/shift — which
        lines up with the <span className="font-medium text-foreground">ceiling</span> here, so treat it as optimistic until you apply the effective-time discount.
      </div>
    </div>
  );
}
