"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import MapGL, { Layer, Source, type MapRef } from "react-map-gl/mapbox";
import type { ExpressionSpecification } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { LocateFixed } from "lucide-react";
import { getApiUrl } from "@/lib/api";
import { useTheme } from "@/components/theme/theme-provider";
import { usePollPalette } from "@/components/insights/use-poll-palette";
import type { ChoroplethCell } from "@/lib/api/insights";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
const mapStyleFor = (theme: string) =>
  theme === "dark" ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/streets-v12";

// Victoria's extent — the sed_upper (Legislative Council) regions all sit inside it.
const VIC_BOUNDS: [number, number, number, number] = [140.8, -39.3, 150.2, -33.9];

/** The `--seq-*` ramp has five steps, and the buckets are cut to match. */
const STEPS = 5;

/**
 * Even 5-bucket thresholds across the reportable range (min→max), rounded to whole %.
 * Colour is not its business — the caller pairs each band with a step of the sequential
 * ramp, which is read from the design tokens so the map re-skins with the theme.
 */
function buildScale(cells: ChoroplethCell[]) {
  const vals = cells
    .filter((c) => c.reportable && typeof c.percent === "number")
    .map((c) => c.percent as number);
  if (vals.length === 0) return null;
  const min = Math.floor(Math.min(...vals));
  const max = Math.ceil(Math.max(...vals));
  const span = Math.max(1, max - min);
  const step = span / STEPS;
  const bucketOf = (v: number) => Math.min(STEPS - 1, Math.floor((v - min) / step));
  const bands = Array.from({ length: STEPS }, (_, i) => ({
    lo: Math.round(min + i * step),
    hi: Math.round(min + (i + 1) * step),
  }));
  return { min, max, bucketOf, bands };
}

/**
 * A poll question's regional estimate as a choropleth over the `sed_upper` vector
 * tiles. Fill is a client-side ["match", ["get","code"], …] from the supplied
 * cells (no feature-state) — cells without a geoCode (the non-geo "Region" band)
 * are simply absent and paint as no-data. Hover surfaces the region % .
 *
 * Mapbox paint expressions need literal colour strings, which is why this used to carry a
 * hand-picked hex ramp. It reads the `--seq-*` tokens through {@link usePollPalette}
 * instead: the strings are still literal by the time Mapbox sees them, but they now come
 * from the stylesheet, follow the theme, and are the ramp the contrast checker passed.
 * The old one did not — its lightest step sat at 1.22:1 against the surface.
 */
export function PollChoroplethMap({
  cells,
  geoKind = "sed_upper",
  height = 380,
  isPublic = false,
  bounds = VIC_BOUNDS,
}: {
  cells: ChoroplethCell[];
  geoKind?: string;
  height?: number;
  /** Chrome-less public viewer: read the anonymous, layer-scoped tile endpoint
   *  (`/insights/public/tiles`) instead of the session-gated `/geo/tiles`. */
  isPublic?: boolean;
  /** `[w,s,e,n]` the map frames on load and on recentre. Defaults to Victoria (the poll's
   *  extent); a national dataset (e.g. the referendum) passes Australia-wide bounds. */
  bounds?: [number, number, number, number];
}) {
  const { theme } = useTheme();
  const palette = usePollPalette();
  const mapRef = useRef<MapRef | null>(null);
  const [hover, setHover] = useState<{ name: string; percent: number | null; reportable: boolean } | null>(null);

  const byCode = useMemo(() => {
    const m = new Map<string, ChoroplethCell>();
    for (const c of cells) if (c.geoCode) m.set(c.geoCode, c);
    return m;
  }, [cells]);

  const scale = useMemo(() => buildScale(cells), [cells]);

  // ["match", ["get","code"], code, colour, …, no-data] — one pair per reportable cell.
  const fillColour = useMemo<ExpressionSpecification | string>(() => {
    const noData = palette?.nodata ?? "transparent";
    if (!scale || !palette) return noData;
    const pairs: (string | number)[] = [];
    for (const c of cells) {
      if (!c.geoCode || !c.reportable || typeof c.percent !== "number") continue;
      pairs.push(c.geoCode, palette.seq[scale.bucketOf(c.percent)]);
    }
    if (pairs.length === 0) return noData;
    return ["match", ["get", "code"], ...pairs, noData] as unknown as ExpressionSpecification;
  }, [cells, scale, palette]);

  const tileUrl = isPublic
    ? `${getApiUrl()}/insights/public/tiles/${geoKind}/{z}/{x}/{y}?v=3`
    : `${getApiUrl()}/geo/tiles/${geoKind}/{z}/{x}/{y}?v=3`;

  const apiOrigin = useMemo(() => {
    try {
      return new URL(getApiUrl()).origin;
    } catch {
      return "";
    }
  }, []);
  const transformRequest = useCallback(
    (url: string, resourceType?: string) =>
      // The authed /geo/tiles surface needs the session cookie; the public tile endpoint is
      // anonymous, so fetch it without credentials (no credentialed-CORS requirement).
      resourceType === "Tile" && !isPublic && apiOrigin && url.startsWith(apiOrigin)
        ? { url, credentials: "include" as const }
        : { url },
    [apiOrigin, isPublic],
  );

  const onMouseMove = useCallback(
    (e: { features?: Array<{ properties?: Record<string, unknown> | null }> }) => {
      const code = e.features?.[0]?.properties?.code as string | undefined;
      const cell = code ? byCode.get(code) : undefined;
      setHover(cell ? { name: cell.breakdownValue, percent: cell.percent, reportable: cell.reportable } : null);
    },
    [byCode],
  );

  // Fit the map back to the region extent — used on load (instant) and by the recentre
  // button (animated) after the user pans/zooms away.
  const recenter = useCallback(
    (duration: number) => {
      const map = mapRef.current?.getMap();
      if (!map) return;
      map.resize();
      map.fitBounds(
        [
          [bounds[0], bounds[1]],
          [bounds[2], bounds[3]],
        ],
        { padding: 24, duration },
      );
    },
    [bounds],
  );

  return (
    <div className="relative overflow-hidden rounded-xl border border-border" style={{ height }}>
      <MapGL
        ref={mapRef}
        mapboxAccessToken={TOKEN}
        initialViewState={{ bounds, fitBoundsOptions: { padding: 24 } }}
        mapStyle={mapStyleFor(theme)}
        style={{ width: "100%", height: "100%" }}
        interactiveLayerIds={["poll-fill"]}
        transformRequest={transformRequest}
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHover(null)}
        onLoad={() => recenter(0)}
      >
        <Source id="poll-regions" type="vector" tiles={[tileUrl]} minzoom={0} maxzoom={16}>
          <Layer id="poll-fill" source-layer="areas" type="fill" paint={{ "fill-color": fillColour, "fill-opacity": 0.75 }} />
          <Layer
            id="poll-line"
            source-layer="areas"
            type="line"
            paint={{ "line-color": palette?.ink ?? "transparent", "line-width": 0.8, "line-opacity": 0.35 }}
          />
        </Source>
      </MapGL>

      {/* Recentre — re-fit the region extent after panning/zooming */}
      <button
        type="button"
        onClick={() => recenter(500)}
        title="Recentre the map"
        aria-label="Recentre the map"
        className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-lg bg-surface/95 px-2 py-1 text-xs font-medium text-foreground shadow-card hover:bg-surface"
      >
        <LocateFixed className="h-3.5 w-3.5" />
        Recentre
      </button>

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
      {scale && palette ? (
        <div className="absolute bottom-2 right-2 rounded-lg bg-surface/95 px-2 py-1.5 shadow-card">
          <div className="flex items-center gap-0.5">
            {scale.bands.map((b, i) => (
              <span
                key={b.lo}
                className="h-3 w-6"
                style={{ backgroundColor: palette.seq[i] }}
                title={`${b.lo}–${b.hi}%`}
              />
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
