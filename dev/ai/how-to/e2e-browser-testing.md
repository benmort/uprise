---
name: e2e-browser-testing
description: Running and writing Playwright browser e2e across Chromium, Firefox and WebKit – the one config that drives every app, the two targets, the shared-database constraint, and how to reproduce an engine-specific bug with a trace.
layer: root
topic: testing
use_when: Writing or running a Playwright spec, adding coverage for a user journey that crosses apps, or chasing a bug that only reproduces in one browser.
last_reviewed: 2026-08-04
---

# Browser e2e

Playwright is the **only** gate on view code. `apps/admin` and `apps/auth` instrument coverage on `src/lib/**` only – pages and components are deliberately out of scope for vitest (see `dev/ai/how-to/definition-of-done.md`), so a page with no e2e has no automated coverage at all.

It is also the only place engine-specific behaviour is visible. A Chromium-only suite cannot see a bug that only bites in Firefox or Safari, and that is not hypothetical: an invitation acceptance that worked in Chrome silently posted nothing in Firefox, leaving the invitation `pending` with no server-side trace of the attempt.

Canonical: `apps/admin/playwright.config.ts`, `apps/admin/e2e/global-setup.ts`, `apps/admin/e2e/invite-journey.spec.ts` (the cross-engine pattern).

## Must have

- **One config, every app.** `apps/admin/playwright.config.ts` is the only Playwright config in the repo. It drives admin (:3000), auth (:3002), product-marketing (:3003) and field (:3005) as well as the api. Specs for the other apps navigate absolutely; only admin uses `baseURL`.
- **Three engines.** `chromium` (branded Chrome via `channel`), `firefox`, `webkit`. Install once with `pnpm --filter admin e2e:install`.
  ```bash
  pnpm --filter admin e2e            # chromium only – the fast local loop
  pnpm --filter admin e2e:firefox    # or e2e:webkit
  pnpm --filter admin e2e:all        # the full matrix
  ```
  **Never put `channel` in the top-level `use` block.** It merges into every project, so a firefox or webkit project would try to launch branded Chrome and fail. Engine selection belongs in `projects`.
- **Two targets, and they are not equivalent.**
  - default (`localhost`) – Playwright boots the apps via `webServer`.
  - `E2E_TARGET=ngrok` – runs against `*.dev.uprise.org.au` with the apps already up (`pnpm dev:all`). This is the **only** mode exercising the real cross-subdomain SSO cookie, and the only one where an app's browser-side call to the API matches production.

  A local `.env` whose `CORS_ALLOWED_ORIGINS` omits `http://localhost:3002` / `:3000` will make every auth-app→API call fail with "Failed to fetch" on the localhost target. If a spec needs the browser to reach the API, use the ngrok target or add those origins.
- **Serial by design.** `workers: 1`, `fullyParallel: false` – the suite shares one seeded database. Do not "fix" this with parallelism; shard by `--project` across CI jobs instead, so each engine gets its own database.
- **Give back what you take.** Anything a spec creates that consumes a finite resource must be cleaned up in the spec. The demo tenant runs on the default Growth plan (`teamMembers: 10`), so accepted invitations exhaust its seats and the journey starts failing with `PLAN_LIMIT` – a failure that reads like a product bug. `pnpm --filter api clear:test-residue` is the backstop, not the plan.
- **Assert the specific thing, not the container.** `getByText(/Invitation Error/)` also matches a network-level "Failed to fetch", so it passes when the browser never reached the API. Assert the message that only a real refusal produces.
- **For a journey, assert the request was issued.** Arm `page.waitForResponse(...)` **before** the click. A browser that silently declines to send a request otherwise shows up as a vague timeout somewhere later, which is exactly what made the Firefox incident so hard to see:
  ```ts
  const post = page.waitForResponse((r) => r.url().includes("/iam/invite/accept"), { timeout: 30_000 });
  await page.getByRole("button", { name: /accept/i }).click();
  expect(await post.catch(() => null), "no POST was issued").not.toBeNull();
  ```
- **Landing ≠ success.** A 200 from an action does not prove the app recovered from it. Assert a follow-on authenticated call (e.g. `/auth/check`) – an accept that returned a perfect 200 and then never used the session it minted is a real failure mode.
- **Service workers are off in every e2e lane.** Both admin and field disable next-pwa when `NODE_ENV=development` unless `ENABLE_PWA=true`, and every lane runs `next dev`. PWA/offline behaviour is therefore **not** covered by this suite in any engine – do not assume it is.

## Anti-patterns

- Adding `channel` to the root `use` block (breaks every non-Chromium project).
- Running the full three-engine matrix on every PR – it triples a serial suite against a 30-minute CI budget. Chromium on PRs, the matrix on main.
- A blanket `test.skip` for an engine. Skip individual tests, with a comment naming the reason.
- Sharing a single-use fixture (an invite token, a one-shot code) across tests or creating it in `beforeAll` – `retries: 1` is on, and the retry will fail for the wrong reason.
- Asserting only that an action returned 2xx, without asserting the app then did something with the result.
- Assuming CI's green means CORS is configured: the e2e job sets no `CORS_ALLOWED_ORIGINS`, and an empty list allows every origin.

## Checklist

- [ ] Spec passes on chromium, firefox and webkit (`e2e:all`), or an individual test is skipped with a stated reason.
- [ ] Any consumed resource (team seat, single-use token) is released by the spec.
- [ ] Journey specs assert the request was issued **and** that the app made a follow-on authenticated call.
- [ ] Assertions target specific copy, not a container that a network failure also renders.
- [ ] New fixtures are created per-test, not in `beforeAll`.
- [ ] The gate in `dev/ai/how-to/definition-of-done.md` is walked.

## Related guides

- `dev/ai/how-to/definition-of-done.md` – the coverage gate and what "done" means; view code is this suite's job.
- `apps/admin/dev/ai/how-to/web-security.md` – the cookie/SSO model these specs exercise.
- `apps/api/dev/ai/how-to/testing-unit.md` – the backend unit layer; carry branch logic there, not in e2e.
