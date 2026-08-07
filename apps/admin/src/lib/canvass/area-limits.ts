import type { AreaLevel } from "@/lib/api/geo";

/**
 * The client half of the API's bounded-geo-query rules.
 *
 * `GET /geo/tiles` and `GET /geo/areas/search` both refuse work that would sweep a whole
 * national layer: the tile endpoint answers 204 below a per-layer zoom floor, and the
 * search endpoint answers `[]` below a per-layer term length. Both floors live server-side
 * in `apps/api/src/geo/geo.service.ts` (`TILE_MIN_ZOOM` / `searchAreas`) because the server
 * cannot depend on a well-behaved client – these are the matching client-side numbers, so
 * the UI never fires a request it knows will come back empty, and can say why instead.
 *
 * Keep the two in lockstep. If they must differ, the client's floor is the higher one.
 */

/**
 * Minimum map zoom at which a level's vector tiles are worth requesting. Only the dense
 * levels have one: a single tile below the floor covers the whole country, which is ~368k
 * meshblocks or ~61k SA1s in one response. SA2 and coarser are small enough to serve whole
 * at any zoom, so they have no floor.
 */
export const AREA_MIN_ZOOM: Partial<Record<AreaLevel, number>> = { mb: 9, sa1: 7 };

/** {@link AREA_MIN_ZOOM} for a level – 0 (no floor) for every level without one. */
export function areaMinZoom(level: AreaLevel): number {
  return AREA_MIN_ZOOM[level] ?? 0;
}

/**
 * Minimum search-term length before an area search is worth issuing. Under three
 * characters there is no trigram for the GIN indexes to match, so a dense level would
 * seq-scan its whole table per keystroke; the small levels (SA2–SA4, ≤ ~2.5k rows) can
 * afford two.
 */
export function areaSearchMinChars(level: AreaLevel): number {
  return level === "mb" || level === "sa1" ? 3 : 2;
}
