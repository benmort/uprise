"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MapPinned, RefreshCw, Save } from "lucide-react";
import { Spinner } from "@uprise/ui";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select, SelectItem } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StateRegion } from "@/components/shell/state-region";
import { useToast } from "@/components/ui/toast";
import { useApi } from "@/lib/use-api";
import { listIndicators } from "@/lib/api/demographics";
import {
  refreshCampaignHeat,
  setCampaignHeatConfig,
  type HeatFactor,
  type HeatPreset,
  type HeatResponse,
} from "@/lib/api/campaigns";
import {
  HEAT_FACTORS,
  HEAT_FACTOR_LABELS,
  heatLegendBands,
} from "@/lib/canvass/heat-fill";
import { CollapsibleCard } from "@/components/canvass/geo-panels/collapsible-card";
import { cn } from "@/lib/utils";

/**
 * Client mirror of the API's preset weights (`heat-score.ts#HEAT_PRESETS`) — only
 * used to seed the sliders when a preset is picked; the server rescores from the
 * preset id itself, so any drift here is display-only. The three opt-in signals
 * (community/progressive/informality) are 0 in every preset by design.
 */
const PRESET_WEIGHTS: Record<HeatPreset, Record<HeatFactor, number>> = {
  persuasion: { doors: 20, persuadability: 30, supporter: 5, fit: 15, efficiency: 15, freshness: 15, community: 0, progressive: 0, informality: 0 },
  gotv: { doors: 15, persuadability: 5, supporter: 40, fit: 10, efficiency: 15, freshness: 15, community: 0, progressive: 0, informality: 0 },
  coverage: { doors: 35, persuadability: 5, supporter: 5, fit: 5, efficiency: 20, freshness: 30, community: 0, progressive: 0, informality: 0 },
};

/** The opt-in signals grouped under "Optional signals" (weight 0 in every preset). */
const OPTIONAL_FACTORS: readonly HeatFactor[] = ["community", "progressive", "informality"];
const CORE_FACTORS: readonly HeatFactor[] = HEAT_FACTORS.filter((f) => !OPTIONAL_FACTORS.includes(f));

/** Defaults mirrored from the API (`heat.service.ts`); the pickers seed with these. */
const DEFAULT_FIT_INDICATOR = "seifa_irsd_decile";
const DEFAULT_COMMUNITY_INDICATOR = "cald_lote_share";

type HeatMode = HeatPreset | "custom";

const MODE_OPTIONS: ReadonlyArray<{ value: HeatMode; label: string }> = [
  { value: "persuasion", label: "Persuasion" },
  { value: "gotv", label: "GOTV" },
  { value: "coverage", label: "Coverage" },
  { value: "custom", label: "Custom" },
];

/** Which mode a saved run's config maps to (preset, unless its weights were overridden). */
function modeFor(meta: HeatResponse["meta"]): HeatMode {
  const preset = PRESET_WEIGHTS[meta.preset];
  if (preset && HEAT_FACTORS.every((f) => (meta.weights[f] ?? 0) === preset[f])) return meta.preset;
  return "custom";
}

/**
 * The targeting weights drawer (sidebar accordion card). Header switch turns the
 * heat layer on/off; the body is the preset picker, the six bounded factor sliders
 * (unlocked by Custom), per-factor coverage bars, honesty notices (low-resolution +
 * constant factors, data vintage), the stale/queued indicator with Refresh, and the
 * guardrail copy. Saving rescores server-side and hands the fresh run up via onData.
 */
export function HeatPanel({
  id = "heat",
  campaignId,
  enabled,
  onEnabledChange,
  data,
  loading,
  error,
  noPermission,
  onRetry,
  onData,
  noBoundaryHref,
}: {
  /** Stable id within the surrounding AccordionGroup. */
  id?: string;
  campaignId: string;
  /** Whether the targeting layer is on (the header switch). */
  enabled: boolean;
  onEnabledChange: (on: boolean) => void;
  data: HeatResponse | null;
  loading?: boolean;
  error?: string;
  noPermission?: boolean;
  onRetry?: () => void;
  /** Receives the fresh run after a config save or a refresh. */
  onData: (next: HeatResponse) => void;
  /** Set when the campaign has no boundary — the panel prompts for one instead of scores. */
  noBoundaryHref?: string | null;
}) {
  const { showToast } = useToast();
  const [mode, setMode] = useState<HeatMode>("coverage");
  const [weights, setWeights] = useState<Record<HeatFactor, number>>({ ...PRESET_WEIGHTS.coverage });
  const [fitIndicator, setFitIndicator] = useState(DEFAULT_FIT_INDICATOR);
  const [communityIndicator, setCommunityIndicator] = useState(DEFAULT_COMMUNITY_INDICATOR);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Sync the controls to the saved config whenever a run arrives — including the
  // lens pickers, which hydrate from the effective config echoed in meta.
  useEffect(() => {
    if (!data) return;
    setMode(modeFor(data.meta));
    setWeights({ ...data.meta.weights });
    if (data.meta.config) {
      setFitIndicator(data.meta.config.fitLens.indicator);
      setCommunityIndicator(data.meta.config.communityLens.indicator);
    }
  }, [data]);

  // SA1-published ABS indicators for the two lens pickers; fetched only while on.
  const indicators = useApi(enabled ? "/demographics/indicators" : null, () => listIndicators(), {
    ttlMs: 600_000,
  });
  const sa1Indicators = useMemo(
    () => (indicators.data ?? []).filter((i) => i.levels.includes("sa1")),
    [indicators.data],
  );

  const pickMode = (m: HeatMode) => {
    setMode(m);
    if (m !== "custom") setWeights({ ...PRESET_WEIGHTS[m] });
  };

  const sum = HEAT_FACTORS.reduce((s, f) => s + (weights[f] ?? 0), 0);

  const save = useCallback(async () => {
    setSaving(true);
    const res = await setCampaignHeatConfig(campaignId, {
      ...(mode === "custom" ? { weights } : { preset: mode }),
      fitLens: { indicator: fitIndicator },
      communityLens: { indicator: communityIndicator },
    });
    setSaving(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't save targeting config", description: res.error });
      return;
    }
    onData(res.data);
    showToast({
      tone: "success",
      title: res.data.meta.queued ? "Saved – recompute queued" : "Targeting rescored",
    });
  }, [campaignId, mode, weights, fitIndicator, communityIndicator, onData, showToast]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const res = await refreshCampaignHeat(campaignId);
    setRefreshing(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't refresh scores", description: res.error });
      return;
    }
    onData(res.data);
  }, [campaignId, onData, showToast]);

  const meta = data?.meta;
  const customOn = mode === "custom";

  // One bounded slider + its coverage bar; shared by the core and optional groups.
  const renderSlider = (f: HeatFactor) => {
    const coverage = Math.round(Math.max(0, Math.min(1, meta?.factorCoverage[f] ?? 0)) * 100);
    return (
      <div key={f}>
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor={`heat-weight-${f}`} className="text-xs font-medium text-foreground">
            {HEAT_FACTOR_LABELS[f]}
          </label>
          <span className="text-xs tabular-nums text-muted-foreground">{weights[f] ?? 0}</span>
        </div>
        <input
          id={`heat-weight-${f}`}
          type="range"
          min={0}
          max={60}
          step={1}
          value={weights[f] ?? 0}
          disabled={!customOn}
          onChange={(e) => setWeights((w) => ({ ...w, [f]: Number(e.target.value) }))}
          className="w-full accent-primary disabled:opacity-50"
        />
        {/* Per-factor coverage: the share of areas this signal reached. */}
        <div className="flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-variant">
            <div className="h-full rounded-full bg-primary/60" style={{ width: `${coverage}%` }} />
          </div>
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
            covers {coverage}% of areas
          </span>
        </div>
      </div>
    );
  };

  return (
    <CollapsibleCard
      id={id}
      title="Targeting"
      description="Where to knock first – SA1 heat"
      action={
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Show the targeting layer"
          onClick={() => onEnabledChange(!enabled)}
          className={cn(
            "relative h-5 w-9 rounded-full border transition-colors",
            enabled ? "border-primary bg-primary" : "border-border bg-surface-variant",
          )}
        >
          <span
            className={cn(
              "absolute left-0.5 top-0.5 h-3.5 w-3.5 rounded-full bg-surface shadow-card transition-transform",
              enabled && "translate-x-4",
            )}
          />
        </button>
      }
    >
      {!enabled ? (
        <p className="text-sm text-muted-foreground">
          Turn on to shade the boundary&rsquo;s SA1s by a blended where-to-knock score – doors,
          persuadability, supporters, fit, walkability and coverage freshness.
        </p>
      ) : noBoundaryHref ? (
        <div>
          <p className="text-sm text-muted-foreground">
            This campaign has no boundary yet – targeting scores the SA1s inside one.
          </p>
          <Button asChild variant="outline" size="sm" className="mt-3 w-full">
            <Link href={noBoundaryHref}>
              <MapPinned className="mr-1.5 h-3.5 w-3.5" />
              Set the campaign boundary
            </Link>
          </Button>
        </div>
      ) : (
        <StateRegion
          loading={loading || (!data && !error && !noPermission)}
          error={error}
          noPermission={noPermission}
          onRetry={onRetry}
          errorTitle="Couldn't load targeting"
          skeleton={
            <div className="space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          }
        >
          {meta ? (
            <div>
              {/* Stale / queued — a big boundary recomputes on the worker. */}
              {meta.queued ? (
                <div className="mb-3 flex items-center gap-2 rounded-lg bg-warning-container px-2.5 py-1.5 text-xs font-medium text-warning-foreground">
                  <Spinner className="h-3 w-3 shrink-0" />
                  Recomputing on the worker – the scores shown are the previous run.
                </div>
              ) : meta.stale ? (
                <div className="mb-3 rounded-lg bg-warning-container px-2.5 py-1.5 text-xs font-medium text-warning-foreground">
                  Scores are stale – inputs have changed since this run. Refresh to rescore.
                </div>
              ) : null}

              <SegmentedControl
                size="sm"
                fluid
                aria-label="Targeting preset"
                value={mode}
                options={MODE_OPTIONS}
                onChange={pickMode}
              />

              {/* Bounded factor sliders — read-only under a preset, unlocked by Custom. */}
              <div className="mt-3 space-y-2.5">
                {CORE_FACTORS.map(renderSlider)}

                {/* Opt-in signals: 0 in every preset — they change nothing until raised. */}
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Optional signals
                  </div>
                  <p className="mb-1.5 text-[11px] text-muted-foreground">
                    Default to 0 in every preset – switch to Custom and raise a slider to blend them in.
                  </p>
                  <div className="space-y-2.5">{OPTIONAL_FACTORS.map(renderSlider)}</div>
                </div>

                <p className="text-xs tabular-nums text-muted-foreground">
                  Weights total {sum}
                  {sum !== 100 ? " – renormalised when scoring" : ""}
                  {!customOn ? " · pick Custom to adjust" : ""}
                </p>
              </div>

              {/* The two demographic lenses — which SA1 indicator "fit" and
                  "multicultural communities" score against. */}
              <div className="mt-3 space-y-2">
                <div>
                  <label
                    htmlFor="heat-fit-lens"
                    className="mb-1 block text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground"
                  >
                    Fit lens
                  </label>
                  <Select id="heat-fit-lens" value={fitIndicator} onValueChange={setFitIndicator}>
                    {sa1Indicators.some((i) => i.key === fitIndicator) ? null : (
                      <SelectItem value={fitIndicator}>{fitIndicator}</SelectItem>
                    )}
                    {sa1Indicators.map((i) => (
                      <SelectItem key={i.key} value={i.key}>
                        {i.name}
                      </SelectItem>
                    ))}
                  </Select>
                </div>
                <div>
                  <label
                    htmlFor="heat-community-lens"
                    className="mb-1 block text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground"
                  >
                    Community lens
                  </label>
                  <Select id="heat-community-lens" value={communityIndicator} onValueChange={setCommunityIndicator}>
                    {sa1Indicators.some((i) => i.key === communityIndicator) ? null : (
                      <SelectItem value={communityIndicator}>{communityIndicator}</SelectItem>
                    )}
                    {sa1Indicators.map((i) => (
                      <SelectItem key={i.key} value={i.key}>
                        {i.name}
                      </SelectItem>
                    ))}
                  </Select>
                </div>
              </div>

              {/* Honesty notices: coarse-resolution + non-differentiating signals. */}
              {meta.lowResolutionFactors.length > 0 ? (
                <ul className="mt-3 space-y-1">
                  {meta.lowResolutionFactors.map((l) => (
                    <li key={`${l.factor}:${l.component}`} className="text-[11px] leading-snug text-muted-foreground">
                      {HEAT_FACTOR_LABELS[l.factor]}: {l.component} data is {l.resolution}-level – every SA1
                      in a region shares one value.
                    </li>
                  ))}
                </ul>
              ) : null}
              {meta.constantFactors.length > 0 ? (
                <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                  Constant across this boundary (won&rsquo;t differentiate):{" "}
                  {meta.constantFactors.map((f) => HEAT_FACTOR_LABELS[f]).join(", ")}.
                </p>
              ) : null}

              {/* Data vintage. */}
              <p className="mt-2 text-[11px] text-muted-foreground">
                {meta.election ? `Election data: ${meta.election.note} · ` : ""}
                {meta.sa1Count.toLocaleString()} SA1s · computed{" "}
                {new Date(meta.computedAt).toLocaleString("en-AU", {
                  day: "numeric",
                  month: "short",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>

              <div className="mt-3 flex gap-2">
                <Button size="sm" className="flex-1" onClick={save} disabled={saving || sum === 0}>
                  {saving ? (
                    <>
                      <Spinner className="mr-2" />
                      Rescoring…
                    </>
                  ) : (
                    <>
                      <Save className="mr-1.5 h-3.5 w-3.5" />
                      Save &amp; rescore
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={refresh}
                  disabled={refreshing}
                  title="Recompute with fresh inputs"
                  aria-label="Refresh scores"
                >
                  {refreshing ? <Spinner /> : <RefreshCw className="h-3.5 w-3.5" />}
                </Button>
              </div>

              <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
                Scores are area-level guides, not individual propensities – local knowledge outranks
                the model.
              </p>
            </div>
          ) : (
            <></>
          )}
        </StateRegion>
      )}
    </CollapsibleCard>
  );
}

/**
 * The compact on-map key for the heat choropleth: five action-labelled bands
 * (hottest first) plus the no-data swatch, with each band's score range where the
 * run produced breaks. Shared by the campaign turf page and the boundary editor.
 */
export function HeatLegend({
  breaks,
  ramp,
  nodata,
  className,
}: {
  breaks: number[];
  ramp: readonly string[];
  nodata: string;
  className?: string;
}) {
  const bands = heatLegendBands(breaks, ramp);
  return (
    <div className={cn("rounded-lg border border-border bg-surface/95 p-2 text-xs shadow-card backdrop-blur", className)}>
      <div className="mb-1 font-semibold text-foreground">Where to knock</div>
      <div className="space-y-0.5">
        {[...bands].reverse().map((b) => (
          <div key={b.band} className="flex items-center gap-1.5">
            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: b.colour }} />
            <span className="text-muted-foreground">{b.label}</span>
            {b.lo !== null ? (
              <span className="ml-auto pl-2 tabular-nums text-[10px] text-muted-foreground">
                {Math.round(b.lo)}–{b.hi === null ? 100 : Math.round(b.hi)}
              </span>
            ) : null}
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span
            className="h-3 w-3 shrink-0 rounded-sm border border-border opacity-40"
            style={{ backgroundColor: nodata }}
          />
          <span className="text-muted-foreground">Insufficient data</span>
        </div>
      </div>
    </div>
  );
}
