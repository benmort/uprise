# Org logo drop-zone (`seed:org-logos`)

`seed:org-logos` (see `../seed-org-logos.ts`) resolves each kept tenant's logo from, in order:
a repo `localFile`, then a file **here** named `<slug>.{png,svg,jpg,jpeg,webp}`, then a `remoteUrl`.
Drop a **white-background-legible** mark here for any tenant without a repo asset. A slug with no
source is skipped (gradient fallback), never a hard failure.

Every mark must read on a **white** chip (the switcher/auth/field/insights render logos on white) —
reject white-on-transparent variants.

## Present

| slug | source | provenance |
|---|---|---|
| `democracy-in-colour` | `democracy-in-colour.png` | democracyincolour.org header wordmark (robots: allowed) |
| `victoria-trades-hall` | `victoria-trades-hall.svg` | weareunion.org.au "WE ARE UNION" desktop logo (robots: allowed) |

`getup`, `climate-200`, `common-threads`, `uprise-labs` resolve from repo assets (see the script).

## Still needed

- `australian-progress` — the repo's `australian-progress.webp` is the WHITE (dark-bg) variant,
  invisible on white; australianprogress.org.au's robots.txt lists AI crawlers, so its site was
  **not** scraped. Drop a colour `australian-progress.png` here to seed it.
