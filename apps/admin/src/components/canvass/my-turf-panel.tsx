"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Layers, Save, Trash2 } from "lucide-react";
import { Spinner } from "@uprise/ui";
import { SectionCard } from "@uprise/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { createTurfFromSources, type TurfUniverse } from "@/lib/api/geo";
import { useTurfBasket } from "@/lib/canvass/turf-basket";
import { invalidateApi } from "@/lib/use-api";
import { UniverseCards } from "@/components/canvass/universe-select";

/**
 * The stacked "my turf" basket panel: every part added from the Divisions/Areas/
 * Addresses explorers, with per-item remove, a name + universe, and one "Cut turf"
 * that unions the lot server-side (createTurfFromSources). Mirrors the campaign
 * boundary editor's "Boundary parts" card. Renders nothing when the basket is empty.
 *
 * The universe (who lands in the turf) can be lifted to the page: pass `universe`
 * + `onUniverseChange` and the page owns the single "Who to include" selector that
 * governs both this basket cut and the page's own immediate cut. Left uncontrolled,
 * the panel keeps its own state and renders its own selector.
 */
export function MyTurfPanel({
  universe: universeProp,
  onUniverseChange,
}: {
  universe?: TurfUniverse;
  onUniverseChange?: (u: TurfUniverse) => void;
} = {}) {
  const router = useRouter();
  const { showToast } = useToast();
  const {
    basket,
    count,
    removeDivision,
    removeArea,
    setPolygons,
    removeAddress,
    clear,
  } = useTurfBasket();
  const [name, setName] = useState("");
  const [universeState, setUniverseState] = useState<TurfUniverse>("hybrid");
  const controlled = universeProp !== undefined;
  const universe = controlled ? universeProp : universeState;
  const setUniverse = controlled ? onUniverseChange! : setUniverseState;
  const [saving, setSaving] = useState(false);

  if (count === 0) return null;

  const cut = async () => {
    setSaving(true);
    const res = await createTurfFromSources({
      name: name.trim() || "New turf",
      universe,
      divisions: basket.divisions.map((d) => ({ type: d.type, code: d.code })),
      areas: basket.areas.map((a) => ({ layer: a.level, code: a.code })),
      polygons: basket.polygons,
      gnafPids: basket.addresses.map((a) => a.gnafPid),
    });
    setSaving(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't cut turf", description: res.error });
      return;
    }
    invalidateApi("/canvass");
    clear();
    setName("");
    showToast({ tone: "success", title: `Turf cut from ${count} part${count === 1 ? "" : "s"}` });
    router.push("/canvass");
  };

  return (
    <>
      <SectionCard title={`My turf (${count})`}>
        <ul className="space-y-1.5">
          {basket.divisions.map((d) => (
            <li key={`div:${d.type}:${d.code}`} className="flex items-center gap-2 text-sm">
              <span className="rounded bg-surface-variant px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                {d.type === "ste" ? "state" : d.type}
              </span>
              <span className="truncate font-medium text-foreground">{d.name}</span>
              <button
                type="button"
                aria-label={`Remove ${d.name}`}
                onClick={() => removeDivision(d.type, d.code)}
                className="ml-auto text-muted-foreground hover:text-error"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
          {basket.areas.map((a) => (
            <li key={`area:${a.level}:${a.code}`} className="flex items-center gap-2 text-sm">
              <span className="rounded bg-surface-variant px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                {a.level}
              </span>
              <span className="truncate font-medium text-foreground">{a.name}</span>
              <button
                type="button"
                aria-label={`Remove ${a.name}`}
                onClick={() => removeArea(a.level, a.code)}
                className="ml-auto text-muted-foreground hover:text-error"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
          {basket.addresses.map((a) => (
            <li key={`addr:${a.gnafPid}`} className="flex items-center gap-2 text-sm">
              <span className="rounded bg-surface-variant px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                door
              </span>
              <span className="truncate font-medium text-foreground">{a.label}</span>
              <button
                type="button"
                aria-label={`Remove ${a.label}`}
                onClick={() => removeAddress(a.gnafPid)}
                className="ml-auto text-muted-foreground hover:text-error"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
          {basket.polygons.length > 0 ? (
            <li className="flex items-center gap-2 text-sm">
              <span className="rounded bg-surface-variant px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                drawn
              </span>
              <span className="font-medium text-foreground">
                {basket.polygons.length} polygon{basket.polygons.length === 1 ? "" : "s"}
              </span>
              <button
                type="button"
                aria-label="Clear drawn polygons"
                onClick={() => setPolygons([])}
                className="ml-auto text-muted-foreground hover:text-error"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ) : null}
        </ul>

        <label className="mb-1 mt-3 block text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
          Name
        </label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New turf" />

        <div className="mt-3 flex gap-2">
          <Button className="flex-1" onClick={() => void cut()} disabled={saving}>
            {saving ? (
              <>
                <Spinner className="mr-2" />
                Cutting…
              </>
            ) : (
              <>
                <Layers className="mr-1.5 h-4 w-4" />
                Cut turf
              </>
            )}
          </Button>
          <Button variant="outline" onClick={clear} disabled={saving} title="Empty the basket">
            Clear
          </Button>
        </div>
      </SectionCard>

      {/* When the page lifts the universe, it owns the single selector – don't
          render a second one here. */}
      {controlled ? null : <UniverseCards value={universe} onChange={setUniverse} />}
    </>
  );
}
