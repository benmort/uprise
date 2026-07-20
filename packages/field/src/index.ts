// @uprise/field — the shared canvasser field surface (meld doc 14 pattern, like
// @uprise/ui): screens, canvass components, offline/geo libs, field hooks and the
// field-facing API calls. Consumed as source via Next `transpilePackages` by both
// apps/field (the standalone PWA) and apps/admin (organiser preview) so the door-
// knocking UI exists in exactly one place.

// ── Components ──────────────────────────────────────────────────────────────
export * from "./components/address-info-card";
export * from "./components/field-install-notice";
export * from "./components/campaign-nav-cards";
export * from "./components/data-table";
export * from "./components/disposition-pad";
export * from "./components/kpi-tile";
export * from "./components/map-gesture-toggle";
export * from "./components/map-size-control";
export * from "./components/map-thumbnail";
export * from "./components/offline-banner";
export * from "./components/prior-contact-strip";
export * from "./components/script-assist-panel";
export * from "./components/canned-response-picker";
export * from "./components/progress-bar";
export * from "./components/role-chip";
export * from "./components/section-card";
export * from "./components/support-level";
export * from "./components/support-level-bar";
export * from "./components/support-pill";
// survey-runner: export the UI runner + its answer/schema shapes, but not its local
// `SurveyQuestion` (the canonical one is the API type from ./api/engagement).
export { SurveyRunner } from "./components/survey-runner";
export type { SurveySchema, SurveyAnswer } from "./components/survey-runner";
export * from "./components/sync-status-badge";
// turf-map: export the map + its stop shape, but not its `LngLat` (the canonical
// LngLat is the GeoJSON tuple from ./lib/geo).
export { TurfMap, AU_BOUNDS } from "./components/turf-map";
export type { MapStop } from "./components/turf-map";
export * from "./components/walk-mode-toggle";
export * from "./components/walk-stop-card";

// ── Hooks ───────────────────────────────────────────────────────────────────
export * from "./hooks/use-field-push";
export * from "./hooks/use-geolocation";
export * from "./hooks/use-local-storage";
export * from "./hooks/use-online-status";
export * from "./hooks/use-sync-queue";
export * from "./hooks/use-tile-pre-cache";
export * from "./hooks/use-walking-directions";

// ── Libs (offline, geo, route, sync queue) ───────────────────────────────────
export * from "./lib/geo";
export * from "./lib/moonlit-dark";
export * from "./lib/idb-store";
export * from "./lib/map-cache";
export * from "./lib/route";
export * from "./lib/survey-flow";
export * from "./lib/script-flow";
export * from "./lib/sync-queue";
export * from "./lib/tile-cache-store";
export * from "./lib/use-theme";
export * from "./lib/volunteer";
export * from "./lib/directions";

// ── Field-facing API ─────────────────────────────────────────────────────────
export * from "./api";

// ── Session helper ───────────────────────────────────────────────────────────
export * from "./lib/session";

// ── Screens (route-level surfaces, rendered by each host app's thin routes) ───
export * from "./screens";
