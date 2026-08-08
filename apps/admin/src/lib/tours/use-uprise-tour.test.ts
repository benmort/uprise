import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CLIMATE_200_TOUR_ID,
  ONBOARDING_TOUR_ID,
  getTourById,
  resetExampleData,
  seedExampleData,
} from "./uprise-tour";
import { AUTO_DWELL_MS, useUpriseTour, useUpriseTourState } from "./use-uprise-tour";

/**
 * The tour's state machine, tested through the three things a presenter actually relies on:
 * where they are in the tour, whether it survives a reload, and whether auto-play does what the
 * clock in the card promises. uprise-tour.test.ts already pins the tour *content*; this file only
 * cares about the behaviour layered over it.
 */

// The seeder creates a real audience + draft blast through the API. Stubbed here so no test can
// reach the network, and so "did starting a tour seed example data" is directly assertable.
vi.mock("@/lib/api", () => ({ createAudience: vi.fn(), createBlast: vi.fn() }));
vi.mock("./uprise-tour", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./uprise-tour")>()),
  seedExampleData: vi.fn(async () => {}),
  resetExampleData: vi.fn(),
}));

const seed = vi.mocked(seedExampleData);
const clearSeed = vi.mocked(resetExampleData);

// The persisted contract. These exact keys are what a reloaded page reads back, so they are as
// load-bearing as the values in them.
const PROGRESS_KEY = "uprise.tour.progress";
const ACTIVE_ID_KEY = "uprise.tour.activeId";
const RUNNING_KEY = "uprise.tour.running";

const onboarding = getTourById(ONBOARDING_TOUR_ID);
const climate200 = getTourById(CLIMATE_200_TOUR_ID);

const render = () => renderHook(() => useUpriseTourState());

/**
 * In-memory localStorage stand-in, same shape as responder-alerts.test.ts uses.
 *
 * This runner's jsdom exposes no `window.localStorage` (Node's own experimental global shadows
 * it), and useLocalStorage swallows the resulting TypeError. Without a stand-in the hook would
 * quietly degrade to plain useState and every persistence assertion below would pass vacuously.
 */
function installStorage() {
  const map = new Map<string, string>();
  const store = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
  Object.defineProperty(window, "localStorage", { value: store, configurable: true });
}

/** Read a key back the way a reloaded page would. */
const stored = (key: string) => window.localStorage.getItem(key);

/** Put a page-reload's worth of state on disk, the way a live tour would have left it. */
const storedProgress = (step: number, tourId: string, running: boolean) => {
  window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(step));
  window.localStorage.setItem(ACTIVE_ID_KEY, JSON.stringify(tourId));
  window.localStorage.setItem(RUNNING_KEY, JSON.stringify(running));
};

beforeEach(() => {
  installStorage();
});

describe("useUpriseTourState – before anything starts", () => {
  it("sits closed, with the onboarding tour queued up", () => {
    const { result } = render();

    // `step` gates the whole card (`if (!active || !step) return null`), so a non-null step while
    // inactive would drop a spotlight over the app of someone who never asked for a tour.
    expect(result.current.active).toBe(false);
    expect(result.current.step).toBeNull();
    expect(result.current.activeTourId).toBe(ONBOARDING_TOUR_ID);
    expect(result.current.totalSteps).toBe(onboarding.steps.length);
    expect(result.current.mode).toBe("manual");
  });

  it("offers both tours to the menu and no resume", () => {
    const { result } = render();
    expect(result.current.tours.map((t) => t.id)).toEqual([ONBOARDING_TOUR_ID, CLIMATE_200_TOUR_ID]);
    expect(result.current.canResume).toBe(false);
    expect(result.current.savedStep).toBeNull();
  });

  // The stage header and deck footer are both driven off these; a stage reported while closed
  // would leave the header rendering a tour that isn't running.
  it("reports no stage and no slide position while closed", () => {
    const { result } = render();
    expect(result.current.currentStage).toBeNull();
    expect(result.current.currentStageNumber).toBe(0);
    expect(result.current.slidePos).toBeNull();
  });
});

describe("useUpriseTourState – starting a tour", () => {
  it("opens the chosen tour at its first step and seeds the example data", () => {
    const { result } = render();
    act(() => result.current.startTour(CLIMATE_200_TOUR_ID, "manual"));

    expect(result.current.active).toBe(true);
    expect(result.current.currentStep).toBe(0);
    expect(result.current.step).toBe(climate200.steps[0]);
    expect(result.current.mode).toBe("manual");
    // Without the seed the composer steps walk an empty workspace – the tour is explicitly built
    // around a throwaway audience + draft so nothing on screen is a mock-up.
    expect(seed).toHaveBeenCalledTimes(1);
  });

  it("re-points the whole state at the tour that was picked, not just the steps", () => {
    const { result } = render();
    act(() => result.current.startTour(CLIMATE_200_TOUR_ID, "manual"));

    expect(result.current.activeTourId).toBe(CLIMATE_200_TOUR_ID);
    expect(result.current.totalSteps).toBe(climate200.steps.length);
    expect(result.current.stages).toBe(climate200.stages);
  });

  it("keeps start/startManual/startAuto on onboarding, differing only in mode", () => {
    // `start` is what first-run auto-start calls for every new teammate. It must never land them
    // in the Climate 200 partner deck, which tours super-admin-only surfaces.
    const manual = render();
    act(() => manual.result.current.startManual());
    expect(manual.result.current.activeTourId).toBe(ONBOARDING_TOUR_ID);
    expect(manual.result.current.mode).toBe("manual");

    const auto = render();
    act(() => auto.result.current.startAuto());
    expect(auto.result.current.activeTourId).toBe(ONBOARDING_TOUR_ID);
    expect(auto.result.current.mode).toBe("auto");
  });

  /**
   * Switching workspace reloads the whole app to re-scope the session, and that happens *inside*
   * the Climate 200 tour – at the network → campaign transition, its most important moment. The
   * running flag is the only thing on disk that tells the reloaded page a tour was mid-flight.
   */
  it("records that a tour is running, for the page that comes back after a reload", () => {
    const { result } = render();
    act(() => result.current.startTour(ONBOARDING_TOUR_ID, "manual"));
    expect(stored(RUNNING_KEY)).toBe("true");
    expect(stored(ACTIVE_ID_KEY)).toBe(JSON.stringify(ONBOARDING_TOUR_ID));
    expect(stored(PROGRESS_KEY)).toBe("0");
  });

  it("clears a pause left over from a previous run", () => {
    const { result } = render();
    act(() => result.current.startTour(ONBOARDING_TOUR_ID, "auto"));
    act(() => result.current.pauseAuto());
    act(() => result.current.startTour(ONBOARDING_TOUR_ID, "auto"));
    // A tour that starts paused looks broken: the clock in the card never moves and the only
    // remedy is a button the presenter has no reason to look for.
    expect(result.current.paused).toBe(false);
  });
});

describe("useUpriseTourState – walking the steps", () => {
  it("moves forward and back through the tour's own steps", () => {
    const { result } = render();
    act(() => result.current.startManual());

    act(() => result.current.next());
    expect(result.current.currentStep).toBe(1);
    expect(result.current.step).toBe(onboarding.steps[1]);

    act(() => result.current.next());
    act(() => result.current.prev());
    expect(result.current.currentStep).toBe(1);
    expect(result.current.step).toBe(onboarding.steps[1]);
  });

  // A negative index makes `steps[currentStep]` undefined, which blanks the card while leaving the
  // tour "active" – the app then swallows Escape and the arrow keys with nothing on screen.
  it("clamps back-navigation at the first step", () => {
    const { result } = render();
    act(() => result.current.startManual());
    act(() => result.current.prev());
    act(() => result.current.prev());

    expect(result.current.currentStep).toBe(0);
    expect(result.current.step).toBe(onboarding.steps[0]);
  });

  /**
   * The callbacks read the step list through a ref rather than closing over it, so that switching
   * tours doesn't need a re-memoised callback. skipToEnd is where a stale list would show: on the
   * 30-step partner tour it would jump to the 13-step onboarding tour's end and finish it early.
   */
  it("skips to the end of the tour that is actually running", () => {
    const { result } = render();
    act(() => result.current.startTour(CLIMATE_200_TOUR_ID, "manual"));
    act(() => result.current.skipToEnd());

    expect(result.current.currentStep).toBe(climate200.steps.length - 1);
    expect(result.current.step).toBe(climate200.steps.at(-1));
    expect(result.current.active).toBe(true);
  });

  it("persists each move, so a reload lands on the step the presenter was on", () => {
    const { result } = render();
    act(() => result.current.startManual());
    act(() => result.current.next());
    act(() => result.current.next());

    expect(stored(PROGRESS_KEY)).toBe("2");
    expect(result.current.savedStep).toBe(2);
  });

  /**
   * Finishing has to clear progress as well as close: leaving the last step saved would keep
   * "Resume" in the menu pointing at a tour the user has already completed, and – because the
   * running flag drives rehydrate – re-open it on the next reload.
   */
  it("closes itself and forgets its progress at the end", () => {
    const { result } = render();
    act(() => result.current.startManual());
    act(() => result.current.skipToEnd());
    act(() => result.current.next());

    expect(result.current.active).toBe(false);
    expect(result.current.step).toBeNull();
    expect(result.current.currentStep).toBe(0);
    expect(result.current.canResume).toBe(false);
    expect(stored(RUNNING_KEY)).toBe("false");
    expect(stored(PROGRESS_KEY)).toBe("null");
  });
});

describe("useUpriseTourState – closing and resuming", () => {
  /**
   * The two halves of closing pull in opposite directions and both matter: the step survives so
   * "Resume" works, but the running flag is cleared so the tour a user deliberately quit cannot
   * ambush them again the next time the app reloads (which a workspace switch does).
   */
  it("keeps the place but drops the running flag", () => {
    const { result } = render();
    act(() => result.current.startManual());
    act(() => result.current.next());
    act(() => result.current.next());
    act(() => result.current.close());

    expect(result.current.active).toBe(false);
    expect(result.current.savedStep).toBe(2);
    expect(result.current.canResume).toBe(true);
    expect(stored(RUNNING_KEY)).toBe("false");
  });

  // The seeded example blast is looked up by id when the composer steps navigate; leaving the old
  // one behind would send a re-run of the tour to a draft from the previous session.
  it("releases the example data on close", () => {
    const { result } = render();
    act(() => result.current.startManual());
    act(() => result.current.close());
    expect(clearSeed).toHaveBeenCalled();
  });

  it("resumes at the saved step, in manual mode, with the tour running again", () => {
    const { result } = render();
    act(() => result.current.startTour(ONBOARDING_TOUR_ID, "auto"));
    act(() => result.current.next());
    act(() => result.current.next());
    act(() => result.current.close());

    seed.mockClear();
    act(() => result.current.resume());

    expect(result.current.active).toBe(true);
    expect(result.current.currentStep).toBe(2);
    expect(result.current.step).toBe(onboarding.steps[2]);
    // Manual regardless of how the tour was originally started: coming back to a deck that is
    // already advancing is disorienting, and the user asked to resume, not to be presented to.
    expect(result.current.mode).toBe("manual");
    expect(stored(RUNNING_KEY)).toBe("true");
    // The example audience/blast were dropped by close, so they have to be re-created.
    expect(seed).toHaveBeenCalledTimes(1);
  });

  it("offers no resume for a tour quit on its very first step", () => {
    // Step 0 is not progress worth advertising – "Resume" there is indistinguishable from "Start".
    const { result } = render();
    act(() => result.current.startManual());
    act(() => result.current.close());
    expect(result.current.savedStep).toBe(0);
    expect(result.current.canResume).toBe(false);
  });

  it("offers no resume for progress that outruns the tour", () => {
    // Tour content is rewritten between deploys – five whole tours were deleted in one go once –
    // so saved progress can outlive the steps it points at. A stale step must not put a "Resume"
    // in the menu that lands on a step which no longer exists.
    storedProgress(onboarding.steps.length + 3, ONBOARDING_TOUR_ID, false);
    const { result } = render();
    expect(result.current.canResume).toBe(false);
  });
});

describe("useUpriseTourState – surviving the workspace-switch reload", () => {
  it("picks a running tour back up where it left off", () => {
    storedProgress(4, CLIMATE_200_TOUR_ID, true);
    const { result } = render();

    expect(result.current.active).toBe(true);
    expect(result.current.currentStep).toBe(4);
    expect(result.current.step).toBe(climate200.steps[4]);
    expect(result.current.activeTourId).toBe(CLIMATE_200_TOUR_ID);
  });

  // The reload can land mid-navigation; an auto-play clock that starts ticking before the
  // presenter has their bearings would advance past the step they were mid-sentence on.
  it("always comes back in manual mode", () => {
    storedProgress(4, CLIMATE_200_TOUR_ID, true);
    const { result } = render();
    expect(result.current.mode).toBe("manual");
  });

  /**
   * The whole point of storing `running` separately from `savedStep`. Someone who pressed Escape
   * on Tuesday and switched workspace on Wednesday must not have the tour reappear – their saved
   * step is only there for the Resume button they may never press.
   */
  it("stays closed when the tour was quit before the reload", () => {
    storedProgress(4, CLIMATE_200_TOUR_ID, false);
    const { result } = render();

    expect(result.current.active).toBe(false);
    expect(result.current.step).toBeNull();
    // …but the place is still remembered for the menu.
    expect(result.current.canResume).toBe(true);
  });

  it("stays closed when there is no saved step to come back to", () => {
    window.localStorage.setItem(RUNNING_KEY, JSON.stringify(true));
    const { result } = render();
    expect(result.current.active).toBe(false);
  });

  // Rehydrate is mount-only: re-running it on a later render would fight the user, re-opening the
  // tour every time some unrelated state changed after they closed it.
  it("rehydrates once, and does not undo a close", () => {
    storedProgress(4, ONBOARDING_TOUR_ID, true);
    const { result, rerender } = render();
    expect(result.current.active).toBe(true);

    act(() => result.current.close());
    rerender();
    rerender();
    expect(result.current.active).toBe(false);
  });
});

describe("useUpriseTourState – stages", () => {
  it("names the stage the current step sits in, numbered for the header", () => {
    const { result } = render();
    act(() => result.current.startTour(CLIMATE_200_TOUR_ID, "manual"));

    const stages = climate200.stages ?? [];
    expect(result.current.currentStage).toBe(stages[0]);
    // 1-based: the header renders "Stage 1 of 10", not "Stage 0 of 10".
    expect(result.current.currentStageNumber).toBe(1);
  });

  it("follows the step into the next stage", () => {
    const { result } = render();
    act(() => result.current.startTour(CLIMATE_200_TOUR_ID, "manual"));
    act(() => result.current.goToStage("c200-campaign"));

    expect(result.current.currentStage?.id).toBe("c200-campaign");
    expect(result.current.currentStageNumber).toBe(3);
    expect(result.current.step?.stage).toBe("c200-campaign");
  });

  /**
   * Jumping a stage is a presenter re-cutting the demo live – the room asked a question, or a
   * section isn't landing. Auto-play carrying on from the new stage would immediately walk away
   * from the thing they jumped to in order to talk about.
   */
  it("hands control back to the presenter on a stage jump", () => {
    const { result } = render();
    act(() => result.current.startTour(CLIMATE_200_TOUR_ID, "auto"));
    act(() => result.current.pauseAuto());
    act(() => result.current.goToStage("c200-doors"));

    expect(result.current.mode).toBe("manual");
    expect(result.current.paused).toBe(false);
  });

  it("lands on the first step of the stage, not somewhere inside it", () => {
    const { result } = render();
    act(() => result.current.startTour(CLIMATE_200_TOUR_ID, "manual"));
    act(() => result.current.goToStage("c200-doors"));

    const landed = result.current.currentStep;
    expect(climate200.steps[landed].stage).toBe("c200-doors");
    expect(climate200.steps.slice(0, landed).some((s) => s.stage === "c200-doors")).toBe(false);
    // The jump is progress like any other – a reload must not rewind past it.
    expect(result.current.savedStep).toBe(landed);
  });

  it("ignores a stage id the running tour does not have", () => {
    // The onboarding tour has none of the c200-* stages. Treating a miss as "step -1" or "step 0"
    // would silently restart the tour under a presenter who mis-clicked.
    const { result } = render();
    act(() => result.current.startManual());
    act(() => result.current.next());
    act(() => result.current.goToStage("c200-doors"));

    expect(result.current.currentStep).toBe(1);
    expect(result.current.currentStage?.id).toBe("onboard-bearings");
  });
});

describe("useUpriseTour – the context consumers see", () => {
  /**
   * TourMenuButton sits in the header and TourRoot provides the state from the app shell. If the
   * two ever get out of order – or the button is rendered on a route the provider doesn't wrap –
   * the default context is what the header gets, and clicking "Start tour" has to be an inert
   * no-op rather than a crash inside an onClick.
   */
  it("falls back to an inert tour outside the provider", () => {
    const { result } = renderHook(() => useUpriseTour());

    expect(result.current.active).toBe(false);
    expect(result.current.activeTourId).toBe(ONBOARDING_TOUR_ID);
    expect(result.current.totalSteps).toBe(onboarding.steps.length);
    expect(() => {
      act(() => {
        result.current.start();
        result.current.next();
        result.current.goToStage("onboard-people");
        result.current.close();
      });
    }).not.toThrow();
    expect(result.current.active).toBe(false);
  });
});

describe("useUpriseTourState – slide position", () => {
  it("numbers a deck slide across the whole tour", () => {
    const { result } = render();
    act(() => result.current.startTour(CLIMATE_200_TOUR_ID, "manual"));
    expect(result.current.slidePos).toEqual({ index: 0, count: 11 });
  });

  // The card branches on `step.slide && slidePos` to render the opaque deck layer instead of the
  // spotlight, so a position reported on a guided step would black out the page it is pointing at.
  it("reports nothing on a spotlight step", () => {
    const { result } = render();
    act(() => result.current.startTour(CLIMATE_200_TOUR_ID, "manual"));
    act(() => result.current.goToStage("c200-admin"));
    expect(result.current.slidePos).toBeNull();

    const flat = render();
    act(() => flat.result.current.startManual());
    expect(flat.result.current.slidePos).toBeNull();
  });
});

describe("useUpriseTourState – auto-play", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Run the clock forward, flushing the effect's microtask hop and React's updates with it. */
  const tick = async (ms: number) => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  };

  it("advances on its own after the dwell, and not before", async () => {
    const { result } = render();
    act(() => result.current.startAuto());

    await tick(AUTO_DWELL_MS - 100);
    // Early advancement is what makes an auto-played demo unwatchable: the step's route hasn't
    // finished loading, so the room sees a spotlight land on a page that is still blank.
    expect(result.current.currentStep).toBe(0);

    await tick(200);
    expect(result.current.currentStep).toBe(1);
  });

  /**
   * A full-screen slide carries its own, much longer dwell (12s vs the 3.7s default tuned for a
   * tooltip beside a highlighted control). Ignoring the override would flick an eight-chip
   * headline slide off the screen before anyone in the room had finished reading it.
   */
  it("honours a step's own dwell", async () => {
    const { result } = render();
    act(() => result.current.startTour(CLIMATE_200_TOUR_ID, "auto"));

    await tick(AUTO_DWELL_MS + 1000);
    expect(result.current.currentStep).toBe(0);

    await tick(climate200.steps[0].dwellMs ?? 0);
    expect(result.current.currentStep).toBe(1);
  });

  it("holds the step while paused, and carries on when released", async () => {
    const { result } = render();
    act(() => result.current.startAuto());
    act(() => result.current.pauseAuto());

    // Pause is what a presenter reaches for when the room interrupts; a clock that kept running
    // underneath would move the demo on mid-answer.
    await tick(AUTO_DWELL_MS * 3);
    expect(result.current.currentStep).toBe(0);

    act(() => result.current.resumeAuto());
    await tick(AUTO_DWELL_MS + 100);
    expect(result.current.currentStep).toBe(1);
  });

  it("stops the clock for good when switched to manual", async () => {
    const { result } = render();
    act(() => result.current.startAuto());
    act(() => result.current.switchToManual());

    await tick(AUTO_DWELL_MS * 4);
    expect(result.current.mode).toBe("manual");
    expect(result.current.currentStep).toBe(0);
  });

  it("stops advancing once the tour is closed", async () => {
    const { result } = render();
    act(() => result.current.startAuto());
    act(() => result.current.close());

    await tick(AUTO_DWELL_MS * 3);
    expect(result.current.active).toBe(false);
    expect(result.current.currentStep).toBe(0);
  });

  it("ends the tour at the last step instead of looping back to the start", async () => {
    const { result } = render();
    act(() => result.current.startAuto());
    act(() => result.current.skipToEnd());

    await tick(AUTO_DWELL_MS * 2);
    expect(result.current.active).toBe(false);
    // Looping would restart a first-run walkthrough forever, on a card whose only escape is Esc.
    expect(result.current.currentStep).toBe(0);
    expect(result.current.canResume).toBe(false);
  });
});
