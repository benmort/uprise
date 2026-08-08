import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

/**
 * jsdom setup for component and hook tests.
 *
 * The runners were `environment: "node"` with no DOM, which meant the React hooks living in
 * `src/lib` — `use-api`, `turf-basket`, `geo-explorer-state`, `use-realtime-inbox` — were inside
 * the gated coverage scope while being structurally impossible to execute. They sat at 0% and
 * dragged `apps/admin` to 48%. This is what makes them testable; `src/app` and `src/components`
 * remain e2e's job for JOURNEYS, but their behaviour is now reachable too.
 *
 * Everything mocked below is something Next injects at runtime or something jsdom does not
 * implement. Nothing here fakes application behaviour — a test that needs a router assertion
 * should assert on these spies, not on a hand-rolled double of its own.
 */

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ── next/navigation ────────────────────────────────────────────────────────
// Exposed on globalThis so a test can assert navigation without re-mocking the module.
export const routerMock = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
};

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

// next/link renders an <a>; the real one needs the router context.
vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (require("react") as any).createElement("a", { href, ...rest }, children),
}));

// ── browser APIs jsdom does not implement ──────────────────────────────────
// Guarded on `window`: this setup file runs for EVERY test, including the ones pinned to the
// node environment with `// @vitest-environment node` (report-error's SSR branch needs a world
// with no window at all). Touching `window` unguarded here would fail those suites at import.
if (typeof window !== "undefined") {
  // Components use these for responsive behaviour and lazy rendering; without them the first
  // render throws and the failure looks like a component bug rather than a missing polyfill.
  if (!window.matchMedia) {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  }

  class MockObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    takeRecords = vi.fn(() => []);
  }
  globalThis.IntersectionObserver ??= MockObserver as unknown as typeof IntersectionObserver;
  globalThis.ResizeObserver ??= MockObserver as unknown as typeof ResizeObserver;

  // Radix and other primitives call these during interaction; jsdom stubs them as undefined.
  window.HTMLElement.prototype.scrollIntoView ??= vi.fn();
  window.HTMLElement.prototype.hasPointerCapture ??= vi.fn(() => false);
  window.HTMLElement.prototype.releasePointerCapture ??= vi.fn();
  window.HTMLElement.prototype.setPointerCapture ??= vi.fn();
}
