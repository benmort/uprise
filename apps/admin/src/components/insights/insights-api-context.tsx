"use client";

import { createContext, useContext } from "react";
import type { ApiResult } from "@uprise/api-client";
import {
  getPollQuestion,
  getPollChoropleth,
  getPublicPollQuestion,
  getPublicPollChoropleth,
  type Crosstab,
  type Choropleth,
} from "@/lib/api/insights";

/**
 * Which insights read endpoints the shared poll components use. The authed admin pages get the
 * tenant-scoped endpoints (default); the chrome-less public poll route wraps its tree in
 * `<InsightsApiProvider mode="public">` so the very same components (KeyFindings → FindingEvidence,
 * the crosstab, the map) fetch the unauthenticated `/insights/public/*` endpoints instead — reused
 * verbatim, no copy. A React context (not a module flag) so it's per-render and SSR-safe.
 */
export type InsightsApi = {
  isPublic: boolean;
  getPollQuestion: (id: string, code: string) => Promise<ApiResult<Crosstab>>;
  getChoropleth: (id: string, code: string, response: string) => Promise<ApiResult<Choropleth>>;
};

const AUTHED: InsightsApi = { isPublic: false, getPollQuestion, getChoropleth: getPollChoropleth };
const PUBLIC: InsightsApi = {
  isPublic: true,
  getPollQuestion: getPublicPollQuestion,
  getChoropleth: getPublicPollChoropleth,
};

const InsightsApiContext = createContext<InsightsApi>(AUTHED);
export const useInsightsApi = () => useContext(InsightsApiContext);

export function InsightsApiProvider({
  mode,
  children,
}: {
  mode: "authed" | "public";
  children: React.ReactNode;
}) {
  return (
    <InsightsApiContext.Provider value={mode === "public" ? PUBLIC : AUTHED}>
      {children}
    </InsightsApiContext.Provider>
  );
}
