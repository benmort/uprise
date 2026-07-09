"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import MapGL, { Layer, Source, type MapRef } from "react-map-gl/mapbox";
import type { ExpressionSpecification } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { getApiUrl } from "@/lib/api";
import { useTheme } from "@/components/theme/theme-provider";
import type { ChoroplethCell } from "@/lib/api/insights";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
const mapStyleFor = (theme: string) =>
  theme === "dark" ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/streets-v12";

// Victoria's extent — the sed_upper (Legislative Council) regions all sit inside it.
const VIC_BOUNDS: [number, number, number, number] = [140.8, -39.3, 150.2, -33.9];

// Sequential 5-class ramp (light → dark). Map paint requires literal colour strings,
// so raw hex here mirrors turf-draw-map's paint expressions (the one design-token
// exception). Blue = more support.
const RAMP = ["#dbeafe", "#93c5fd", "#3b82f6", "#1d4ed8", "#1e3a8a"];
const NO_DATA = "#cbd5e1";

/** Even 5-bucket thresholds across the reportable range (min→max), rounded to whole %. */
function buildScale(cells: ChoroplethCell[]) {
  const vals = cells
    .filter((c) => c.reportable && typeof c.percent === "number")
    .map((c) => c.percent as number);
  if (vals.length === 0) return null;
  const min = Math.floor(Math.min(...vals));
  const max = Math.ceil(Math.max(...vals));
  const span = Math.max(1, max - min);
  const step = span / RAMP.length;
  const bucketOf = (v: number) => Math.min(RAMP.length - 1, Math.floor((v - min) / step));
  const legend = RAMP.map((colour, i) => ({
    colour,
    lo: Math.round(min + i * step),
    hi: Math.round(min + (i + 1) * step),
  }));
  return { min, max, bucketOf, legend };
}

/**
 * A poll question's regional estimate as a choropleth over the `sed_upper` vector
 * tiles. Fill is a client-side ["match", ["get","code"], …] from the supplied
 * cells (no feature-state) — cells without a geoCode (the non-geo "Region" band)
 * are simply absent and paint as no-data. Hover surfaces the region % .
 */
export function PollChoroplethMap({
  cells,
  geoKind = "sed_upper",
  height = 380,
}: {
  cells: ChoroplethCell[];
  geoKind?: string;
  height?: number;
}) {
  const { theme } = useTheme();
  const mapRef = useRef<MapRef | null>(null);
  const [hover, setHover] = useState<{ name: string; percent: number | null; reportable: boolean } | null>(null);

  const byCode = useMemo(() => {
    const m = new Map<string, ChoroplethCell>();
    for (const c of cells) if (c.geoCode) m.set(c.geoCode, c);
    return m;
  }, [cells]);

  const scale = useMemo(() => buildScale(cells), [cells]);

  // ["match", ["get","code"], code, colour, …, NO_DATA] — one pair per reportable cell.
  const fillColour = useMemo<ExpressionSpecification | string>(() => {
    if (!scale) return NO_DATA;
    const pairs: (string | number)[] = [];
    for (const c of cells) {
      if (!c.geoCode || !c.reportable || typeof c.percent !== "number") continue;
      pairs.push(c.geoCode, RAMP[scale.bucketOf(c.percent)]);
    }
    if (pairs.length === 0) return NO_DATA;
    return ["match", ["get", "code"], ...pairs, NO_DATA] as unknown as ExpressionSpecification;
  }, [cells, scale]);

  const tileUrl = `${getApiUrl()}/geo/tiles/${geoKind}/{z}/{x}/{y}?v=3`;

  const apiOrigin = useMemo(() => {
    try {
      return new URL(getApiUrl()).origin;
    } catch {
      return "";
    }
  }, []);
  const transformRequest = useCallback(
    (url: string, resourceType?: string) =>
      resourceType === "Tile" && apiOrigin && url.startsWith(apiOrigin)
        ? { url, credentials: "include" as const }
        : { url },
    [apiOrigin],
  );

  const onMouseMove = useCallback(
    (e: { features?: Array<{ properties?: Record<string, unknown> | null }> }) => {
      const code = e.features?.[0]?.properties?.code as string | undefined;
      const cell = code ? byCode.get(code) : undefined;
      setHover(cell ? { name: cell.breakdownValue, percent: cell.percent, reportable: cell.reportable } : null);
    },
    [byCode],
  );

  return (
    <div className="relative overflow-hidden rounded-xl border border-border" style={{ height }}>
      <MapGL
        ref={mapRef}
        mapboxAccessToken={TOKEN}
        initialViewState={{ bounds: VIC_BOUNDS, fitBoundsOptions: { padding: 24 } }}
        mapStyle={mapStyleFor(theme)}
        style={{ width: "100%", height: "100%" }}
        interactiveLayerIds={["poll-fill"]}
        transformRequest={transformRequest}
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHover(null)}
        onLoad={() => {
          const map = mapRef.current?.getMap();
          if (map) {
            map.resize();
            map.fitBounds(
              [
                [VIC_BOUNDS[0], VIC_BOUNDS[1]],
                [VIC_BOUNDS[2], VIC_BOUNDS[3]],
              ],
              { padding: 24, duration: 0 },
            );
          }
        }}
      >
        <Source id="poll-regions" type="vector" tiles={[tileUrl]} minzoom={0} maxzoom={16}>
          <Layer id="poll-fill" source-layer="areas" type="fill" paint={{ "fill-color": fillColour, "fill-opacity": 0.75 }} />
          <Layer id="poll-line" source-layer="areas" type="line" paint={{ "line-color": "#334155", "line-width": 0.8, "line-opacity": 0.6 }} />
        </Source>
      </MapGL>

      {/* Hover readout */}
      {hover ? (
        <div className="pointer-events-none absolute left-2 top-2 rounded-lg bg-surface/95 px-2.5 py-1.5 text-xs shadow-card">
          <span className="font-semibold text-foreground">{hover.name}</span>
          <span className="ml-2 tabular-nums text-muted-foreground">
            {hover.reportable && typeof hover.percent === "number" ? `${Math.round(hover.percent)}%` : "small base"}
          </span>
        </div>
      ) : null}

      {/* Sequential legend */}
      {scale ? (
        <div className="absolute bottom-2 right-2 rounded-lg bg-surface/95 px-2 py-1.5 shadow-card">
          <div className="flex items-center gap-0.5">
            {scale.legend.map((b) => (
              <span key={b.colour} className="h-3 w-6" style={{ backgroundColor: b.colour }} title={`${b.lo}–${b.hi}%`} />
            ))}
          </div>
          <div className="mt-0.5 flex justify-between text-[10px] tabular-nums text-muted-foreground">
            <span>{scale.min}%</span>
            <span>{scale.max}%</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
