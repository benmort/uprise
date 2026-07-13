/**
 * Pure turf-cutting planner: group whole mesh blocks into turfs of a target address count.
 * Kept free of Nest/Prisma so it is unit-testable; the `canvass:cut-turf` script feeds it mesh
 * blocks (with boundary-clipped address counts) and turns each plan into a `createTurfFromAreas`
 * call. Naming mirrors the admin `autoTurfName` (turf/page.tsx) so cut turfs read the same as
 * hand-cut ones.
 */

export type PlannerBlock = {
  code: string;
  name: string | null;
  /** Boundary-clipped address count for this mesh block (whole-MB count × coverage). */
  addresses: number;
  /** Centroid, for the spatial-locality sort. Omit to fall back to name order. */
  lat?: number;
  lng?: number;
};

export type TurfPlan = {
  name: string;
  codes: string[];
  addresses: number;
  blockCount: number;
  /** True when the turf falls outside [min,max] — a lone oversized MB, or a too-small tail/campaign. */
  outOfRange: boolean;
};

/** Hilbert-curve distance for a cell on a 2^order grid — adjacent d values are spatially adjacent. */
function hilbertD(order: number, x: number, y: number): number {
  let rx: number;
  let ry: number;
  let d = 0;
  for (let s = order >> 1; s > 0; s = s >> 1) {
    rx = (x & s) > 0 ? 1 : 0;
    ry = (y & s) > 0 ? 1 : 0;
    d += s * s * ((3 * rx) ^ ry);
    // Rotate the quadrant so the curve stays continuous.
    if (ry === 0) {
      if (rx === 1) {
        x = s - 1 - x;
        y = s - 1 - y;
      }
      const t = x;
      x = y;
      y = t;
    }
  }
  return d;
}

/**
 * Order mesh blocks so neighbours in the list are neighbours on the ground — a Hilbert space-filling
 * curve over their centroids. Packing this order (see `planTurfs`) yields compact, walkable turfs of
 * adjacent blocks rather than scattered ones. Falls back to name order when centroids are missing.
 * Reusable across any campaign: feed it the campaign's mesh blocks, pack, cut.
 */
export function orderByLocality(blocks: PlannerBlock[]): PlannerBlock[] {
  const located = blocks.filter((b) => typeof b.lat === "number" && typeof b.lng === "number");
  if (located.length < blocks.length || located.length === 0) {
    return [...blocks].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  }
  const lats = located.map((b) => b.lat!);
  const lngs = located.map((b) => b.lng!);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const ORDER = 1 << 16; // 65536-cell grid per axis — ample resolution for a campaign extent.
  const norm = (v: number, lo: number, hi: number) =>
    hi === lo ? 0 : Math.min(ORDER - 1, Math.max(0, Math.round(((v - lo) / (hi - lo)) * (ORDER - 1))));
  return [...blocks].sort(
    (a, b) =>
      hilbertD(ORDER, norm(a.lng!, minLng, maxLng), norm(a.lat!, minLat, maxLat)) -
      hilbertD(ORDER, norm(b.lng!, minLng, maxLng), norm(b.lat!, minLat, maxLat)),
  );
}

/** Deterministic turf name from its mesh-block names (mirrors admin `autoTurfName`). */
export function autoTurfName(names: Array<string | null | undefined>): string {
  const clean = names.map((n) => (n ?? "").trim()).filter(Boolean);
  if (clean.length === 0) return "Untitled turf";
  if (clean.length === 1) return clean[0]!;
  if (clean.length === 2) return `${clean[0]} + ${clean[1]}`;
  return `${clean[0]} + ${clean.length - 1} more`;
}

/**
 * Greedily pack mesh blocks (in the order given — caller sorts for geographic coherence) into
 * turfs targeting `[min,max]` addresses. To keep turfs inside the range rather than filling to the
 * ceiling and leaving big remainders, a turf is CLOSED as soon as it reaches `min`. Rules:
 *  - Blocks with 0 addresses are dropped (nothing to knock).
 *  - Once a turf has met `min`, if the next block would push it over `max`, it's closed first.
 *  - A single block larger than `max` can't be split at whole-MB granularity → its own (flagged) turf.
 *  - A trailing run that never reaches `min` merges into the previous turf (may nudge it over `max`);
 *    a whole campaign under `min` yields one small (flagged) turf.
 * Turfs outside `[min,max]` are flagged `outOfRange` so the caller can report them.
 */
export function planTurfs(blocks: PlannerBlock[], opts: { min: number; max: number }): TurfPlan[] {
  const { min, max } = opts;
  const usable = blocks.filter((b) => b.addresses > 0);
  const buckets: PlannerBlock[][] = [];
  let cur: PlannerBlock[] = [];
  let sum = 0;
  const flush = () => {
    if (cur.length > 0) {
      buckets.push(cur);
      cur = [];
      sum = 0;
    }
  };
  for (const b of usable) {
    // Already at target and this block would overflow → close the current turf first.
    if (cur.length > 0 && sum >= min && sum + b.addresses > max) flush();
    cur.push(b);
    sum += b.addresses;
    // Reached the target size → close it (keeps turfs near the low end of the range).
    if (sum >= min) flush();
  }
  // Trailing run that never reached `min`: fold into the previous turf, else keep it (flagged).
  if (cur.length > 0) {
    if (buckets.length > 0) buckets[buckets.length - 1]!.push(...cur);
    else buckets.push(cur);
  }
  return buckets.map((bucket) => {
    const addresses = bucket.reduce((n, b) => n + b.addresses, 0);
    return {
      name: autoTurfName(bucket.map((b) => b.name)),
      codes: bucket.map((b) => b.code),
      addresses,
      blockCount: bucket.length,
      outOfRange: addresses < min || addresses > max,
    };
  });
}
