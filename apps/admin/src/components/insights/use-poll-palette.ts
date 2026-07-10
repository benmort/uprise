"use client";

import { useEffect, useState } from "react";
import { buildPollPalette, type PollPalette } from "@/lib/insights/palette";

const readFromDom = () =>
  buildPollPalette((name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim());

/**
 * The design tokens, resolved to hex, for feeding ApexCharts. Null before the DOM exists.
 *
 * The whole reason this is a `MutationObserver` and not `useMemo(…, [theme])`:
 *
 * React commits effects **child before parent**. `ThemeProvider` sits near the root and
 * toggles `.dark` on `<html>` inside *its* effect, which therefore runs *after* the
 * effect of any chart beneath it. A chart that read `getComputedStyle` during render, or
 * in its own effect keyed on `theme`, would sample the class list one commit too early
 * and keep painting the previous theme's colours until something else re-rendered it.
 *
 * Observing the attribute sidesteps the ordering entirely — we re-read when the class
 * actually changes, whoever changed it. That also covers the pre-hydration no-flash
 * script in `theme-provider.tsx`, which sets `.dark` before React has mounted at all.
 */
export function usePollPalette(): PollPalette | null {
  const [palette, setPalette] = useState<PollPalette | null>(() =>
    typeof document === "undefined" ? null : readFromDom(),
  );

  useEffect(() => {
    setPalette(readFromDom());

    const observer = new MutationObserver(() => setPalette(readFromDom()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return palette;
}

/**
 * The same hook, under the name to use outside the insights section.
 *
 * The sequential ramp it returns (`--seq-*`) now paints address density on the geo explorer
 * as well as poll choropleths and heatmaps, so "poll palette" stopped being true at every
 * call site. The module still lives here because the insights chart builders are its main
 * consumer — only the name has outgrown them.
 */
export const useChartPalette = usePollPalette;
