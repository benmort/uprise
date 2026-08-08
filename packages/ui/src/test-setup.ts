import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

/**
 * Unmount between tests.
 *
 * Without it every rendered tree stays in the document, so `getAllByRole("textbox")` returns the
 * previous test's inputs as well and keystrokes land on a stale, unmounted component. The symptom
 * is a test that passes alone and fails in sequence — which is exactly how it presented.
 */
afterEach(() => cleanup());
