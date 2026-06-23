# Prog admin → yarns port — comparison + checklist

Porting prog's admin-client (85 routes) into yarns `apps/admin` as pixel-perfect,
non-functional replicas under a collapsable **Prog** sidebar group. Pages are vendored from
prog verbatim (own UI kit under `src/components/prog/`, prog's `dark:` variants kept,
providers/API stripped → static mock data).

**Match:** ✅ exact equivalent in yarns · ◑ loose cousin (different scope/medium) · ✗ none.
**Action:** `vendor` (port it) · `reuse` (yarns already has it) · `skip`.
**Status:** `[x]` done · `[ ]` pending.

> **Batch 1 = sections H + I** (Business/billing + Workspace settings). Everything else pending.

## A. Dashboard & core
| Route | Yarns | Match | Action | Status |
|---|---|---|---|---|
| `/admin` dashboard | `/dashboard` | ✅ | reuse | [ ] |
| `/admin/profile` | `/profile` | ✅ | reuse | [ ] |
| `/admin/account` | `/account` | ✅ | reuse | [ ] |
| `/admin/activity` | dashboard activity widget | ◑ | vendor | [ ] |
| `/admin/calendar` | — | ✗ | vendor | [ ] |

## B. Actions
| Route | Yarns | Match | Action | Status |
|---|---|---|---|---|
| `/admin/surveys` | `/engagement/surveys` | ✅ | reuse | [ ] |
| `/admin/petitions` | — | ✗ | vendor | [ ] |
| `/admin/forms` | — | ✗ | vendor | [ ] |
| `/admin/fundraisers` | — | ✗ | vendor | [ ] |

## C. Channels
| Route | Yarns | Match | Action | Status |
|---|---|---|---|---|
| `/admin/email` (+`/[hash]`) | `/inbox` (different medium) | ◑ | vendor | [ ] |
| `/admin/chats` | `/inbox` | ◑ | vendor | [ ] |
| `/admin/calls` | API only, no web page | ◑ | vendor | [ ] |
| `/admin/social-media` | — | ✗ | vendor | [ ] |
| `/admin/direct-mail` | — | ✗ | vendor | [ ] |

## D. Audience
| Route | Yarns | Match | Action | Status |
|---|---|---|---|---|
| `/admin/audience` | `/audience` | ✅ | reuse | [ ] |
| `/admin/audience/persons` | `/audience/[id]`,`/contacts/[id]` | ◑ | vendor | [ ] |
| `/admin/audience/segments` (+`new`,`[id]`,`[id]/edit`) | `/audience` (yarns=audiences, not segments) | ◑ | vendor | [ ] |
| `/admin/reports` | `/analytics` | ◑ | vendor | [ ] |
| `/admin/tags` | tag-chips, no page | ◑ | vendor | [ ] |
| `/admin/queries` | — | ✗ | vendor | [ ] |
| `/admin/activists` | `/audience`/`/contacts` | ◑ | vendor | [ ] |

## E. Organising
| Route | Yarns | Match | Action | Status |
|---|---|---|---|---|
| `/admin/ladders` | — | ✗ | vendor | [ ] |
| `/admin/events` | `/canvass/[id]/shifts` (diff) | ◑ | vendor | [ ] |

## F. Grant management (17) — all ✗ none, vendor, pending
`dashboard`, `applications`, `action-flow`, `forms`, `settings`, `reviewing/{manage,Leaderboard,Progress,Settings}`, `grants/{manage,funds,allocations,payments,contracts,reports,settings,users}`. — [ ]

## G. Tasks
| Route | Yarns | Match | Action | Status |
|---|---|---|---|---|
| `/admin/tasks/list` | — | ✗ | vendor | [ ] |
| `/admin/tasks/kanban` | — (needs @dnd-kit) | ✗ | vendor | [ ] |

## H. Business / billing — **BATCH 1**
| Route | Yarns | Match | Action | Status |
|---|---|---|---|---|
| `/admin/billing` | — | ✗ | vendor | [ ] |
| `/admin/plans` | marketing `/plans` only | ◑ | vendor | [ ] |
| `/admin/transactions` (+`/[hash]`) | — | ✗ | vendor | [ ] |
| `/admin/invoices` (+`/[hash]`) | — | ✗ | vendor | [ ] |
| `/admin/products` (+`/new`) | — | ✗ | vendor | [ ] |
| `/admin/support-tickets` (+`/[id]`) | — | ✗ | vendor | [ ] |
| `/admin/checkout` | — | ✗ | vendor | [ ] |

## I. Workspace settings — **BATCH 1**
| Route | Yarns | Match | Action | Status |
|---|---|---|---|---|
| `/admin/tenant/settings` | `/settings` | ◑ | vendor | [ ] |
| `/admin/team` | `/settings/roles` | ◑ | vendor | [ ] |
| `/admin/tenants` (+`new`,`[tenantId]`,`[tenantId]/members`) | tenant switcher only | ◑ | vendor | [ ] |

## J. Data & files — all ✗ none, vendor, pending
`keywords`, `questions-custom-fields`, `personalization-datasets`, `custom-targets`, `id-targets`, `file-manager`. — [ ]

## K. Developer hub
| Route | Yarns | Match | Action | Status |
|---|---|---|---|---|
| `/admin/syncs` | `/settings/integrations` | ◑ | vendor | [ ] |
| `api-keys`,`ai-assistant`,`form-elements`,`uploads`,`email-wrappers`,`page-wrappers`,`snippets`,`shortlinks` | — | ✗ | vendor | [ ] |

## L. Support — all ✗ none, vendor, pending
`email-support`, `knowledge-base`, `trainings`, `release-notes`. — [ ]

## M–O. Onboarding / Security
| Route | Yarns | Match | Action | Status |
|---|---|---|---|---|
| `/admin/onboarding` | TourRoot (diff) | ◑ | vendor | [ ] |
| `/admin/security` | auth app handles it | ◑ | vendor | [ ] |

---

## Tally (85)
- ✅ exact (reuse): 4 — dashboard, profile, account, surveys.
- ◑ loose cousin: ~20.
- ✗ none: ~61 (grant-mgmt 17, business/commerce, tasks, data-tooling, support, dev-hub).

## Notes
- Vendored UI kit: `apps/admin/src/components/prog/` (ui + shared/forms). Keep prog `dark:`
  variants verbatim — **WS1 dark sweep must exclude `(main)/prog/**` and `components/prog/**`**.
- yarns-native screens with no prog counterpart (not part of this port): `/canvass/*`,
  `/channels/{text,whatsapp}`, `/journeys`, `/compliance`, `/engagement/{scripts,dispositions,canned-responses}`, `/settings/data`.
