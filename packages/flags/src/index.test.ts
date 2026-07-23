import { describe, it, expect } from "vitest";
import {
  FLAGS,
  FLAG_META,
  FLAG_DEFAULTS,
  FEATURE_FLAG_KEYS,
  NAV_FLAGS,
  isFeatureFlagKey,
  flagControllableBy,
  type FeatureFlagKey,
} from "./index";

describe("FLAGS catalogue", () => {
  it("includes every core flag plus one flag per nav item", () => {
    // 13 core flags are declared in index.ts; the rest are generated from NAV_FLAGS.
    expect(FLAGS.length).toBe(13 + NAV_FLAGS.length);
  });

  it("has a unique key for every flag", () => {
    const keys = FLAGS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("declares a non-empty description and envVar for every flag", () => {
    for (const f of FLAGS) {
      expect(f.description.length).toBeGreaterThan(0);
      expect(f.envVar.length).toBeGreaterThan(0);
    }
  });

  it("uses the flag key as its own envVar for every flag", () => {
    // The catalogue keeps env kill-switches named identically to the flag key.
    for (const f of FLAGS) {
      expect(f.envVar).toBe(f.key);
    }
  });

  it("only uses the four known flag kinds", () => {
    const kinds = new Set(FLAGS.map((f) => f.kind));
    for (const k of kinds) {
      expect(["release", "ops", "experiment", "navigation"]).toContain(k);
    }
  });
});

describe("FLAG_META / FLAG_DEFAULTS consistency", () => {
  it("has meta for every default and a default for every meta (keys align)", () => {
    expect(Object.keys(FLAG_META).sort()).toEqual(Object.keys(FLAG_DEFAULTS).sort());
  });

  it("keys align exactly with FEATURE_FLAG_KEYS", () => {
    expect(FEATURE_FLAG_KEYS.slice().sort()).toEqual(Object.keys(FLAG_META).sort());
  });

  it("maps each meta entry back to its own FlagDef by key", () => {
    for (const f of FLAGS) {
      expect(FLAG_META[f.key as FeatureFlagKey]).toBe(f);
    }
  });

  it("mirrors each FlagDef.default into FLAG_DEFAULTS", () => {
    for (const f of FLAGS) {
      expect(FLAG_DEFAULTS[f.key as FeatureFlagKey]).toBe(f.default);
    }
  });

  it("resolves specific known defaults", () => {
    // Realtime + AI assist ship ON; journeys + WhatsApp ship OFF (release-gated).
    expect(FLAG_DEFAULTS.FEATURE_REALTIME_ENABLED).toBe(true);
    expect(FLAG_DEFAULTS.FEATURE_AI_ASSIST_ENABLED).toBe(true);
    expect(FLAG_DEFAULTS.FEATURE_JOURNEYS_ENABLED).toBe(false);
    expect(FLAG_DEFAULTS.FEATURE_WHATSAPP_ENABLED).toBe(false);
    expect(FLAG_DEFAULTS.BLAST_DRY_RUN).toBe(false);
  });
});

describe("isFeatureFlagKey", () => {
  it("returns true for a real catalogue key", () => {
    expect(isFeatureFlagKey("FEATURE_REALTIME_ENABLED")).toBe(true);
    expect(isFeatureFlagKey("FEATURE_NAV_INBOX")).toBe(true);
  });

  it("returns false for an unknown key", () => {
    expect(isFeatureFlagKey("FEATURE_NOT_A_REAL_FLAG")).toBe(false);
    expect(isFeatureFlagKey("")).toBe(false);
  });

  it("agrees with membership in FLAG_META for every real key", () => {
    for (const key of FEATURE_FLAG_KEYS) {
      expect(isFeatureFlagKey(key)).toBe(true);
    }
  });
});

describe("flagControllableBy", () => {
  it("reports a global-only ops flag as controllable only by global", () => {
    expect(flagControllableBy("FEATURE_REALTIME_ENABLED", "global")).toBe(true);
    expect(flagControllableBy("FEATURE_REALTIME_ENABLED", "env")).toBe(false);
    expect(flagControllableBy("FEATURE_REALTIME_ENABLED", "tenant")).toBe(false);
    expect(flagControllableBy("FEATURE_REALTIME_ENABLED", "plan")).toBe(false);
  });

  it("reports a release flag as env/tenant/plan/global controllable", () => {
    for (const layer of ["env", "tenant", "plan", "global"] as const) {
      expect(flagControllableBy("FEATURE_JOURNEYS_ENABLED", layer)).toBe(true);
    }
  });

  it("reports a plan-driven flag as tenant/plan/global but never env", () => {
    expect(flagControllableBy("FEATURE_AI_ASSIST_ENABLED", "tenant")).toBe(true);
    expect(flagControllableBy("FEATURE_AI_ASSIST_ENABLED", "plan")).toBe(true);
    expect(flagControllableBy("FEATURE_AI_ASSIST_ENABLED", "global")).toBe(true);
    expect(flagControllableBy("FEATURE_AI_ASSIST_ENABLED", "env")).toBe(false);
  });

  it("never lists 'network' in any flag's controllableBy (resolution-only layer)", () => {
    for (const f of FLAGS) {
      expect(flagControllableBy(f.key as FeatureFlagKey, "network")).toBe(false);
    }
  });
});
