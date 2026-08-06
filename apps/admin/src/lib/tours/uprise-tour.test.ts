import { describe, it, expect } from "vitest";

import {
  CLIMATE_200_STAGES,
  CLIMATE_200_TOUR_ID,
  ONBOARDING_STAGES,
  ONBOARDING_TOUR_ID,
  UPRISE_TOURS,
  climate200TourSteps,
  getTourById,
  onboardingTourSteps,
  stageEntryPoints,
  stageOfStep,
  type TourDefinition,
} from "./uprise-tour";

const climate200 = getTourById(CLIMATE_200_TOUR_ID);
const onboarding = getTourById(ONBOARDING_TOUR_ID);

describe("tour registry", () => {
  it("ships exactly the two maintained tours", () => {
    // The WhatsApp, canvassing, engagement, journeys and full-walkthrough tours were removed:
    // they spotlighted selectors that no longer exist and walked pages with no data, which in a
    // live demo reads as a broken product. A tour is only worth shipping if it is kept true.
    expect(UPRISE_TOURS.map((t) => t.id)).toEqual([ONBOARDING_TOUR_ID, CLIMATE_200_TOUR_ID]);
  });

  it("resolves an unknown or stale id to onboarding, not to whatever is listed first", () => {
    expect(getTourById("uprise-app-walkthrough").id).toBe(ONBOARDING_TOUR_ID);
    expect(getTourById("uprise-whatsapp-channel").id).toBe(ONBOARDING_TOUR_ID);
    expect(getTourById(null).id).toBe(ONBOARDING_TOUR_ID);
    expect(getTourById(undefined).id).toBe(ONBOARDING_TOUR_ID);
  });

  it("resolves a known id to that tour", () => {
    expect(getTourById(CLIMATE_200_TOUR_ID).id).toBe(CLIMATE_200_TOUR_ID);
  });

  it("gives every tour a unique id, a step, and stages", () => {
    const ids = UPRISE_TOURS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const tour of UPRISE_TOURS) {
      expect(tour.steps.length).toBeGreaterThan(0);
      expect(tour.stages?.length).toBeGreaterThan(0);
    }
  });
});

describe("stage helpers", () => {
  it("returns null for a tour with no stages", () => {
    const flat: TourDefinition = { ...onboarding, stages: undefined };
    expect(stageOfStep(flat, 0)).toBeNull();
    expect(stageEntryPoints(flat)).toEqual([]);
  });

  it("maps each step to its declared stage", () => {
    for (const tour of UPRISE_TOURS) {
      tour.steps.forEach((step, i) => {
        expect(stageOfStep(tour, i)?.id).toBe(step.stage);
      });
    }
  });

  it("gives one entry point per stage, each pointing at that stage's first step", () => {
    for (const tour of UPRISE_TOURS) {
      const entries = stageEntryPoints(tour);
      expect(entries).toHaveLength(tour.stages?.length ?? 0);
      for (const { stage, stepIndex } of entries) {
        expect(tour.steps[stepIndex].stage).toBe(stage.id);
        // "First" step: nothing before it may belong to the same stage.
        expect(tour.steps.slice(0, stepIndex).some((s) => s.stage === stage.id)).toBe(false);
      }
    }
  });

  it("drops a stage that declares itself but owns no step", () => {
    const orphan: TourDefinition = {
      ...climate200,
      stages: [...CLIMATE_200_STAGES, { ...CLIMATE_200_STAGES[0], id: "ghost", label: "Ghost" }],
    };
    expect(stageEntryPoints(orphan).some((e) => e.stage.id === "ghost")).toBe(false);
    expect(stageEntryPoints(orphan)).toHaveLength(CLIMATE_200_STAGES.length);
  });

  it("handles a step index past the end without throwing", () => {
    expect(stageOfStep(climate200, climate200.steps.length + 5)).toBeNull();
  });
});

describe.each([
  ["Climate 200", climate200TourSteps, CLIMATE_200_STAGES, 25],
  ["onboarding", onboardingTourSteps, ONBOARDING_STAGES, 12],
] as const)("%s tour", (_name, steps, stages, expectedMinutes) => {
  it("declares a stage on every step, and only stages that exist", () => {
    const stageIds = new Set(stages.map((s) => s.id));
    for (const step of steps) {
      expect(step.stage).toBeTruthy();
      expect(stageIds.has(step.stage as string)).toBe(true);
    }
  });

  it("keeps steps grouped in stage order", () => {
    // stageEntryPoints assumes it — a stage whose steps interleave with another's would make
    // "jump to stage" land somewhere the presenter did not ask for.
    const order = stages.map((s) => s.id);
    const seen = steps.map((s) => order.indexOf(s.stage as string));
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
  });

  it("never points a step at a surface known to be empty", () => {
    // /data/demographics has never had the ABS load run, and telephony has no numbers on the
    // demo databases. Touring either shows an empty screen to the person you are trying to convince.
    const routes = steps
      .map((s) => (typeof s.route === "string" ? s.route : null))
      .filter((r): r is string => r !== null);
    expect(routes.some((r) => r.startsWith("/data/demographics"))).toBe(false);
    expect(routes.some((r) => r.startsWith("/channels/"))).toBe(false);
  });

  it("budgets a length the stage selector can show", () => {
    expect(stages.reduce((sum, s) => sum + s.minutes, 0)).toBe(expectedMinutes);
    for (const stage of stages) {
      expect(stage.minutes).toBeGreaterThan(0);
      expect(stage.keyMessage.length).toBeGreaterThan(0);
    }
  });
});

describe("the onboarding tour specifically", () => {
  it("stays clear of super-admin-only surfaces", () => {
    // It is the first-run tour for any new teammate, most of whom are not super-admins. A step
    // routing to /super/* or the embedded field app would dead-end them on a permission error.
    const routes = onboardingTourSteps
      .map((s) => (typeof s.route === "string" ? s.route : null))
      .filter((r): r is string => r !== null);
    expect(routes.some((r) => r.startsWith("/super/"))).toBe(false);
    expect(routes.some((r) => r.startsWith("/app/"))).toBe(false);
  });
});
