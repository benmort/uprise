import type { BoundarySource, DescribedSource } from "@/lib/api/campaigns";
import type { TurfDivisionType } from "@/lib/api/geo";

/**
 * Put human names back on a reloaded campaign boundary.
 *
 * `GET /canvass/campaigns/:id/boundary` returns two parallel lists: `sources` (the machine
 * definition — layer plus code) and `describedSources` (the same entries resolved to names). The
 * boundary page read only the first and filled the display name with `name: s.code`, so a
 * boundary that read "Balmain, Newtown" while you were building it came back as "SED10015,
 * SED10042" the moment you reloaded — and the campaign's own definition became unreadable to the
 * organiser who wrote it. The names were sitting in the same response the whole time.
 *
 * Matched on code within a division kind. A code with no described entry keeps the code as its
 * label — still poor, but honest, and better than dropping the division from the list.
 */
export function nameDivisionSources(
  sources: BoundarySource[] | null | undefined,
  described: DescribedSource[] | null | undefined,
): Array<{ type: TurfDivisionType; code: string; name: string }> {
  const namesByCode = new Map<string, string>();
  for (const d of described ?? []) {
    if (d.kind === "polygon") continue;
    if (d.code && d.name) namesByCode.set(d.code, d.name);
  }
  return (sources ?? [])
    .filter((s): s is Extract<BoundarySource, { kind: "division" }> => s.kind === "division")
    .map((s) => ({ type: s.type, code: s.code, name: namesByCode.get(s.code) ?? s.code }));
}
