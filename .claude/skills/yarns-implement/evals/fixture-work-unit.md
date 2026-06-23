# Fixture: a 2-layer work-unit brief

Frozen input for the yarns-implement eval. A cold session is given this brief plus the
yarns-implement skill, then graded against `answer-key.md`.

---

## Task brief: "Let organisers archive a turf"

We need to let an organiser archive a canvass turf they no longer want worked, and
have that archived state show in the turf list UI.

Requirements:

1. A turf gains an `archived` state. From `active` an organiser can archive it; an
   archived turf cannot be archived again, and cannot have new doors assigned.
2. Archiving emits a domain event so the analytics rollup can stop counting the turf.
3. Only a user with the turf-manage permission may archive.
4. The web turf list shows an "Archived" badge on archived turfs and hides the
   "Assign doors" action for them.

Notes:
- The turf aggregate already exists in the `canvass` schema with an `active` status.
- No existing turfs need their data changed – this is additive.
- Single developer working in one session; the user has NOT asked for sub-agents and
  has set no multi-agent budget.
