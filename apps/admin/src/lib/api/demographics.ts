import { request } from "@/lib/api";

/**
 * ABS demographics read client (Census 2021 + SEIFA) — indicators attached to ASGS regions,
 * painted on the geo explorer's boundary tiles. Local `request` client + inline types, exactly
 * like `lib/api/geo.ts`. The choropleth joins to tiles by region `code`: `rows` (SA2+) drive a
 * client `["match"]`; for SA1/meshblock `rows` is absent and the value is baked onto the tile
 * (fetched via `/geo/tiles/{level}?metric=<key>`), painted by a `["step"]` on the `breaks`.
 */

export type AbsLevel = "mb" | "sa1" | "sa2" | "sa3" | "sa4";

export type AbsIndicator = {
  key: string;
  name: string;
  category: string;
  unit: string;
  format: string | null;
  description: string | null;
  source: string | null;
  polarity: string;
  /** ASGS levels this indicator is loaded at (drives which levels the picker offers). */
  levels: string[];
  sort: number;
};

export type AbsChoroplethRow = { code: string; value: number | null };

export type AbsChoropleth = {
  indicator: { key: string; name: string; unit: string; format: string | null; polarity: string };
  level: AbsLevel;
  regions: number;
  min: number | null;
  max: number | null;
  /** Four national quantile breaks cutting five bands. Empty before the loader has run. */
  breaks: number[];
  /** Present for client-join levels (sa2/sa3/sa4); absent for sa1/mb (painted from the tile). */
  rows?: AbsChoroplethRow[];
};

export type AbsRegionValue = {
  key: string;
  name: string;
  category: string;
  unit: string;
  format: string | null;
  polarity: string;
  value: number | null;
};
export type AbsRegionProfile = { level: AbsLevel; code: string; name: string; values: AbsRegionValue[] };

export type AbsStatus = {
  indicators: number;
  values: number;
  levels: string[];
  lastIngested: string | null;
};

export function listIndicators() {
  return request<AbsIndicator[]>("/demographics/indicators");
}

export function getChoropleth(level: AbsLevel, indicator: string) {
  return request<AbsChoropleth>(
    `/demographics/choropleth?level=${encodeURIComponent(level)}&indicator=${encodeURIComponent(indicator)}`,
  );
}

export function getRegionProfile(level: AbsLevel, code: string) {
  return request<AbsRegionProfile>(
    `/demographics/regions/${encodeURIComponent(level)}/${encodeURIComponent(code)}`,
  );
}

export function getDemographicsStatus() {
  return request<AbsStatus>("/demographics/status");
}
