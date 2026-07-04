"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { loadTurfUniverse } from "@/lib/api";
import type { TurfUniverse } from "@/lib/api/geo";
import { useToast } from "@/components/ui/toast";
import { invalidateApi } from "@/lib/use-api";

/**
 * The shared cut-turf flow (previously duplicated across divisions/areas index
 * + detail pages): create → materialise the chosen universe (unless
 * existing-only) → toast → back to /canvass. `busy` carries the in-flight
 * row's identifier for per-row spinners.
 */
export function useCutTurf(universe: TurfUniverse) {
  const router = useRouter();
  const { showToast } = useToast();
  const [busy, setBusy] = useState("");

  const cutTurf = useCallback(
    async (opts: {
      /** Row identifier for the busy state (e.g. the division/area code). */
      id: string;
      /** Display name for the success toast. */
      name: string;
      /** The create call – returns the new turf's id. */
      create: () => Promise<{ ok: true; data: { id: string } } | { ok: false; error: string }>;
      /** Where to go after success. Default "/canvass". */
      then?: string | null;
    }) => {
      setBusy(opts.id);
      const res = await opts.create();
      if (!res.ok) {
        setBusy("");
        showToast({ tone: "error", title: "Couldn't cut turf", description: res.error });
        return false;
      }
      const cold = universe === "existing" ? null : await loadTurfUniverse(res.data.id, universe);
      setBusy("");
      // Forward-looking: no useApi caller keys on /canvass yet, but the turf
      // and campaign lists will as they migrate to useApi – free then.
      invalidateApi("/canvass");
      const coldCount = cold?.ok ? cold.data.materialised : 0;
      showToast({
        tone: "success",
        title: `Turf cut from ${opts.name}`,
        description: coldCount > 0 ? `${coldCount.toLocaleString()} cold doors loaded.` : undefined,
      });
      if (opts.then !== null) router.push(opts.then ?? "/canvass");
      return true;
    },
    [universe, router, showToast],
  );

  return { cutTurf, busy };
}
