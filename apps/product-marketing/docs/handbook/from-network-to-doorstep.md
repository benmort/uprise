# From network to doorstep

Elections in our seats are won at the door. Nothing moves a soft voter like a neighbour, and the doorstep is where the data is born – support level, concerns, consent to recontact. Every later channel depends on what gets captured there.

The hard part is not any one of those things. It is the join between them. A network holds the assets – supporters, data, money and know-how – spread across dozens of independent campaigns, while each campaign on its own is thin: a small team, a volunteer surge that arrives late, and no time to build machinery from scratch. The job of shared tooling is to move network capacity all the way to the doorstep without every campaign rebuilding the same stack.

This page is the whole pipeline in one place: seven stages, one unbroken pipe. Each has its own handbook page; this is how they fit together, and what breaks when a join leaks.

## The flow at a glance

| Stage | What it settles |
| --- | --- |
| **Network** | Shared canon – one address file, electoral geography, access for every campaign |
| **Campaign** | Pick the audience, set the targets, speak one support scale |
| **Turf** | Cut doors that actually exist, sized to a real shift |
| **Shift** | Volunteers paired, briefed and equipped – app or paper |
| **Doorstep** | The conversation – captured once, in the volunteer's own words |
| **Data** | Back to HQ live: attempted, contacted, pace against target |
| **Follow-up** | Dispositions become segments; segments feed calls, SMS and election day |

## 1. Network – shared foundations, held once

**One address canon for everyone.** G-NAF, the national geocoded address file, so turf resolves to real doors rather than approximations. When every campaign works off the same addresses, a door counted in one seat means the same thing as a door counted in the next.

**Electoral geography built in.** Divisions, booth catchments, meshblocks and census layers, the same for every campaign, so nobody spends the first fortnight assembling a map.

**Each campaign runs its own shop on shared rails.** White-label portals and role-based access, with network-level oversight above them. Down flows infrastructure; up flows evidence. That two-way movement is the whole point of a network – what worked in one seat should brief the next.

## 2. Campaign – choose the fight before cutting a single street

**Audiences defined against the roll and census geography.** Segments, not vibes. See [Audiences and segments](/docs/audiences-and-segments).

**One five-point support scale.** The shared language every conversation eventually maps back to. Agree it before the first shift, because retrofitting a scale to a fortnight of dispositions is a fortnight wasted.

**Targets set as pace.** Doors per weekend, conversations per shift – and visible to the people doing the work, not just to HQ.

**Find the movable middle.** Choropleth maps over census geography show where the undecideds live. Skip the locked-in; spend the hours on the unsure.

## 3. Turf – cut doors that exist, sized to a shift

Draw on the map or pull from meshblocks and booth catchments, with live address counts while you cut, so the workload is known before a volunteer is booked.

**Size to the shift.** 120–150 doors per pair per three hours; fewer for apartment blocks, rural runs and first-timers. Turf cut too big produces coverage data that is a lie by omission.

**Walk lists optimised on real walking distance,** grouped by street, so the route makes sense on foot rather than on a straight-line map.

**Recut every week.** Retire hostile streets, densify where coverage lags, and revisit high-contact streets with unresolved conversations. See [Turf and walk lists](/docs/turf-and-walk-lists).

## 4. Shift – people to doors, in pairs

**Shifts scheduled and named before recruitment.** Volunteers sign into a shift, not a vague intention. "10am Saturday" produces roughly twice the people that "sometime Saturday" does.

**Pairs, not singles** – for safety and for confidence, with experienced knockers matched to new ones.

**Set up in the room.** App installed to the home screen on wi-fi, with someone to help, before anyone walks out the door.

**Paper stays an option.** Simplicity recruits volunteers, and a print pathway is a feature rather than a fallback. See [Growing a volunteer team](/docs/growing-a-volunteer-team) and [Running a doorknock weekend](/docs/running-a-doorknock-weekend).

## 5. Doorstep – the conversation is the product

**Script as a guide, not a cage.** Connect, establish, explore, close – and listen twice as long as you talk.

**Three or four questions, branching where needed.** Dispositions in the volunteer's own vocabulary, mapped to the support scale underneath. See [Building a branching survey](/docs/building-a-branching-survey).

**Offline is the default assumption.** Every knock queues to an on-device outbox and flushes the moment signal returns. A volunteer in a basement block is not offline by mistake, and missing numbers mid-shift are almost always an unflushed queue rather than a lost knock.

**Captured once.** Callback requests, sign-ups and consent recorded at the door – never re-keyed from paper at midnight.

## 6. Data – back up the wire while the shift is live

**A live action room.** Active canvassers refresh roughly every ten seconds: who has started, who has stalled, who needs a call.

**Broadcast push to the field** for real things – weather, a target change, a meeting point. A channel that only carries signal keeps getting read.

**Attempted and contacted tracked separately.** Contact rate is the honest number; conflating the two flatters coverage and hides a timing problem until it is too late to fix.

**Auditable coverage.** Partial turf completion recorded, reassignments logged, nothing double-counted. See [Reading your results](/docs/reading-your-results).

## 7. Follow-up – the loop closes

**Dispositions become segments.** Supporters to mobilisation, undecideds to persuasion calls, opponents retired from the lists so nobody spends another hour there.

**Missed doors become call queues.** The recontact loop is old, proven craft: one dataset serving doors and phones is how a weekend's non-contacts turn into the following week's calls.

**Everything rolls toward election day** – one day, no second chances, and the fortnight of preparation runs on this same data. See [Election day operations](/docs/election-day-operations).

**And the evidence flows up.** What worked in one seat briefs the next. The network gets smarter with every weekend.

## Where the pipe leaks

Most field problems are a join, not a stage:

- **No shared address canon.** Turf that resolves to approximations produces doors that don't exist and coverage nobody can compare between seats.
- **A support scale agreed after the first shift.** Every earlier conversation has to be re-interpreted, and half of it can't be.
- **Turf sized to a map rather than a shift.** Volunteers finish a third of it and the coverage number lies.
- **Data re-keyed from paper.** The re-keying is where consent, callbacks and nuance go missing, and it happens at midnight when nobody is careful.
- **Dispositions that never become segments.** The most expensive data the campaign owns, collected and then left sitting.

## Related

- [Your first 30 days](/docs/your-first-30-days)
- [Running a doorknock weekend](/docs/running-a-doorknock-weekend)
- [Turf and walk lists](/docs/turf-and-walk-lists)
- [Reading your results](/docs/reading-your-results)
- [Election day operations](/docs/election-day-operations)
