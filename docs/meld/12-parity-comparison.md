# Prog ↔ Yarns — Full Parity Comparison (2026-06-22)

> **Closure addendum (2026-06-23).** The gap-closure below was executed in six milestones (M1–M6, commits `02c82ae`·`3556f9e`·`e045ff7`·`4162e84`·`09da620`·`b78cd8d`) and adversarially re-verified by a 7-agent workflow (`wf_28778f9a`), whose three real findings were then fixed (`f02090d`). Post-closure state:
> - **Audience → AT_PARITY** for the ported scope: identity resolution (`recordSourceRecord`/`resolveIdentity`) + Contact-spine stamping + `audience.imported` are now wired into the Action Network import. **Segments are intentionally not ported** (product decision — see `12-parity-outstanding.md`), so the dormant evaluator stays out of scope rather than counting as a gap.
> - **Telephony → AT_PARITY** — SMS callback claim, transactional `txStatus`, `UNDELIVERED`, call lifecycle events, blast outbox events, per-SMS read, MessageTemplate CRUD.
> - **Email → AT_PARITY** — full lifecycle events (atomic) + raw-HTML/dynamic-template send.
> - **Payment → AT_PARITY** — receipt/refund reactions (network-customer fallback), ensure-customer-at-checkout, PaymentMethod write path, `FOR UPDATE` on `mark*`.
> - **Identity/Tenant → AT_PARITY** — all lifecycle events (incl. register sign-in), `signIn` extraction, invite decline + already-member rejection, tenant rename/delete events + slug validation, network enrichment.
> - Verification gates: **432 api tests green** (+41 over baseline), AppModule boot smoke green, recursive typecheck clean, all 9 builds green, telephony migration applied, reactions dedup proven against a real DB. Remaining items are infra-only (live-stack e2e + BullMQ publish leg) or deferred-by-design.

## Overall verdict

Yarns has reached behavioural **near-parity** with prog on every money- and message-critical surface — payment (92%), email (88%), identity (88%), tenant (82%) and telephony (82%) are all functionally complete, with several capabilities that exceed prog (real Stripe/SendGrid/Twilio REST adapters where prog ships Noop stubs; session revoke-all on password reset; an explicit no-membership login rejection; a blast lifecycle richer than prog's). The single drag on the portfolio is **audience (65%, GAPS_REMAIN)**: its segment-evaluation engine and identity-resolution primitives are verified complete and at parity in isolation, but they are entirely **unreachable in the running app** — there is no segment write boundary, the SEGMENT_EVAL queue has a consumer with no producer, and `recordSourceRecord`/`resolveIdentity` have zero production callers. Across the five near-parity domains the residual work is concentrated in **durable outbox-event emission** (lifecycle/transition events that downstream reactions would consume) plus a handful of read-enrichment and validation polish items — none blocking. Excluding deferred-by-design items (event-sourced aggregates/replay, multi-org aggregate, OWNER enum, OTT handoff), mean behavioural parity is **~83%**.

| Domain | Verdict | Parity % | Headline gap |
|---|---|---|---|
| Payment | NEAR_PARITY | 92 | EnsureCustomer-at-checkout (P1 convenience); PaymentMethod write path (P2) |
| Email | NEAR_PARITY | 88 | Plain-text only — no raw-HTML/dynamic-template send path (P1) |
| Identity | NEAR_PARITY | 88 | 8 identity lifecycle events unemitted (P1 breadth); sign-in not extracted/tested (P1) |
| Tenant | NEAR_PARITY | 82 | Invitation decline-by-token + already_member rejection (only P1 behavioural gap) |
| Telephony | NEAR_PARITY | 82 | SMS callback not claim-guarded + tx-SMS txStatus never advances on delivery (P1) |
| Audience | GAPS_REMAIN | 65 | Segment lifecycle absent — complete evaluator engine is unreachable in production (P1) |

---

## Payment — NEAR_PARITY (92%)

**At parity (closed):**
- Status FSM (recorded/processing/succeeded/failed/refunded/partially_refunded), with a deliberate `partially_refunded→partially_refunded` self-transition for unlimited Stripe partial refunds.
- `recordPayment` validation (positive-integer cents, 3-letter currency) → RECORDED + `payment.status.changed` in a tx.
- `markProcessing/markSucceeded/markFailed` — guarded transitions + outbox emit per step.
- Refund accounting — outstanding guard, partial→PARTIALLY_REFUNDED / completing→REFUNDED, P2002 idempotent no-op backed by `@@unique([paymentId, processorRefundId])` (NULL kept distinct so manual refunds aren't blocked).
- Webhook idempotency layer-3 (`webhookEvents.claim('stripe', event.id)` + release-on-error) and **mandatory HMAC verify** (t=/v1= parse, sha256 over `${t}.${rawBody}`, `timingSafeEqual`, 300s tolerance; rejects on unset secret / empty body / bad sig).
- Full webhook dispatch (payment_intent.*, charge.refunded delta math, subscription.*, invoice.paid, customer.*), including the beyond-prog behaviour of recording a fresh payment on succeeded-with-no-aggregate.
- Idempotent read-model projections (customer/subscription/invoice), all tenant-scoped reads + GET payments/:id, and cross-domain reactions (network→Stripe customer; subscription→tenant status).
- **Exceeds prog:** real REST Stripe adapter with retry + health endpoint, where prog binds NoopStripeAdapter by default.

**Open:**
- *EnsureCustomer at checkout* — **P1**. No lazy create/lookup of a customer from networkId+email before checkout; only the network-created reaction provisions one. *(in tracker)*
- *PaymentMethod attach/detach/setDefault write path* — **P2**. Yarns has only projection + read + GET; prog ships 3 handlers + 3 adapter methods incl. one-default-per-customer enforcement. **Tracker miss.** Mitigated because cards flow through the proxied Stripe portal.
- *No-op reaction for payment.succeeded* — **P2/cosmetic** (downgraded from P1). Events ARE emitted; prog's `PaymentCompletedReaction` is itself a documented no-op and prog has zero refund/receipt/entitlement reactions, so the only delta is an unmapped-log cosmetic.

**Architectural stance (NA by design):** Refund as a first-class ES aggregate; event-sourced Payment/Customer/Refund replay; FOR-UPDATE row-locking on mark* (low-risk, webhook claim dedups the common case). Yarns uses Prisma rows + FSM + outbox per doc-00 decision 1.

---

## Email — NEAR_PARITY (88%)

**At parity (closed):**
- Status FSM QUEUED→SENDING→SENT→DELIVERED|BOUNCED|FAILED plus late DELIVERED→BOUNCED (and a harmless QUEUED/SENDING→FAILED superset).
- Transactional pipeline with FAILED+errorMessage on provider error and re-throw.
- Per-tenant template override over built-in defaults with isActive gating.
- All 8 cross-domain sends wired (magic_link, recovery, verification, welcome, invitation, contact_form, demo_request, newsletter).
- Webhook dedup on (provider, sg_event_id) with release-on-error; dual correlation (emailId custom_arg + sg_message_id suffix-stripped); first-write-wins open/click; idempotent transition replays; epoch→Date with now() fallback.
- Tenant-scoped reads + template list/get/upsert under RBAC; `email.email.queued` appended inside the create tx.
- **Exceeds prog:** real SendGrid REST adapter with retry backoff (vs a Noop stub).

**Open:**
- *Raw-HTML body + dynamic-template send path* — **P1**. `SendGridService.send` hardcodes `content:[{type:'text/plain'}]`; every email renders plain text. Dominant reason parity < 100. *(in tracker)*
- *Intermediate + engagement lifecycle events not emitted* — **P2**. Only queued/delivered/bounced reach the outbox; sending/sent/failed and open/click (and dropped→FAILED) emit nothing. Low impact — no consumer. *(in tracker)*
- *SendGrid ECDSA webhook signature verification* — **P2**. Path gates only on an optional shared secret and is auth-allowlisted (publicly reachable); documented hardening item, not a prog regression. *(in tracker)*

**Architectural stance (NA by design):** Event-sourced email-message aggregate/replay. (Prog source not present in this checkout; prog-side claims accepted on the verified yarns side + tracker.)

---

## Identity — NEAR_PARITY (88%)

**At parity (closed):**
- Register/CreateUser write path (unique-email + unique-slug, atomic User+Tenant+owner-member tx, `iam.user.created`).
- Password sign-in (bcrypt verify + membership-required rejection + 2FA branch returning twofaRequired/challengeId + session cookie). RecordSignIn audit (lastSignInAt, swallowed so it never blocks login).
- Magic-link request/consume (no account-existence leak, single-use); password reset (no-leak, non-consuming verify, 8-char min, single-use, **+ revoke-all sessions** beyond prog).
- Email + mobile verification (single-use codes flipping flags in a tx; E.164 guard on setMobile); SMS 2FA enable/disable/start/resend/verify.
- Profile update with displayName mirror; avatars add/select/delete/list with single-selected invariant.
- `/auth/check` GetCurrentUser equivalent (id/role/tenantId/email + memberships + verification/2FA flags — **emailVerified exceeds prog's surface**).
- Invitation preview + accept (new-user create / existing attach, member upsert, emits `iam.user.created` new-only + tenant.member.added + invitation.accepted); tenant selection with fallback to earliest valid membership.

**Open:**
- *Identity lifecycle events not emitted* — **P1 (breadth)**. **Eight** prog events unemitted (EmailVerified, PasswordResetRequested, PasswordReset, MobileVerified, TwoFactorEnabled, TwoFactorDisabled, UserSignedIn, ProfileUpdated); only `iam.user.created` (=UserRegistered) fires. State changes are correct but downstream reactions can't trigger on identity transitions. *(in tracker; the verdict undercounted as 6)* This is why NEAR not AT parity.
- *Sign-in logic extraction + tests* — **P1**. Verify+membership+2FA+session still inline in the controller; happy path is hit by e2e global-setup, but the 2FA and no-membership branches are untested and there's no controller spec. *(in tracker)*
- *ClearSelectedAvatar standalone op* — **P2**. No deselect-without-delete. *(in tracker)*

**Architectural stance (NA by design):** OTT issue/exchange (superseded by parent-domain httpOnly session-cookie SSO, doc-14); GetUser read-by-id (internal lookup, parity-neutral — **tracker miss but low value**); event-sourced User aggregate/replay.

---

## Tenant — NEAR_PARITY (82%)

**At parity (closed):**
- Create tenant (slug normalise, unique-slug conflict, network-exists check, owner→ORGANISER member, env-admin no-owner edge, emits created + member.added); update name + settings (Json reaches column); soft-delete with deletedAt filtered everywhere (get 404s, list/memberships exclude).
- Members list/add/update-role/remove, each in a tx with an outbox event; **last-organiser guard on both demote and remove**.
- Invitations: create (7-day TTL, single pending per (tenant,email) upsert, base64url token, sent event), list, revoke; preview-by-token + accept-by-token (auto-membership, new-user create, emits member.added + accepted + new-user iam.user.created).
- Networks create/get/list-tenants/update-billing; subdomain/slug availability check (declared before :id, deliberately public); self-service registration (atomic user+tenant+owner, tenant-pinned session).
- RBAC via CASL @RequirePermission on every route; GetUserTenants soft-deleted filter.

**Open:**
- *Invitation decline-by-token + already_member rejection + revoke event* — **P1** (the only P1 behavioural gap). No decline endpoint (only admin revoke); addMember upserts so re-adding silently changes role instead of throwing already_member; revokeInvitation writes status='declined' but emits no outbox event. *(in tracker)*
- *TenantRenamed event + SLUG_RE validation + org-contact @IsEmail* — **P2**. updateTenant emits no renamed event; no slug-shape regex; contact email is @IsString not @IsEmail. *(in tracker)*
- *GetUserTenants network plan/status join + client aliases* — **P2**. Returns only {tenantId, tenantName, role}; prog adds id/subdomain/displayName aliases + network {planName, subscriptionStatus} so admin billing renders without round-trips. *(in tracker)*
- *TenantDeleted outbox event* — **P2**. deleteTenant sets deletedAt but emits no deleted event. *(in matrix/backlog tracker docs, not the outstanding doc)*
- *Slug-update capability on UpdateTenant* — **P2**. UpdateTenantDto exposes only name; a tenant can never be re-slugged. *(in matrix tracker doc)*

**Architectural stance (NA by design):** Event-sourced aggregates/replay; multi-org Organisation aggregate (folded to 1:1 OrgProfile, doc-11); OWNER-as-distinct-enum (reuses ORGANISER + last-organiser guard).

---

## Telephony — NEAR_PARITY (82%)

**At parity (closed):**
- Call FSM full 7-state lifecycle + `mapTwilioCallStatus` (canceled→FAILED); voice status-callback **3-layer idempotency** (claim/release + canTransition gate); call metadata binding on completion (duration/recording/price abs-major→positive-cents/currency/endedAt).
- `telephony.call.initiated` **and** `telephony.call.completed` emitted via outbox in a tx (tracker line 20 understates — initiated is now emitted too).
- Transactional SMS FSM (PENDING→QUEUED→SENT→DELIVERED|UNDELIVERED|FAILED), bypassing consent/compliance/suppression by design with a separate sender.
- **Real Twilio adapter** (token-bucket limiter, bounded concurrency, exp-backoff retry, 429/Retry-After cooldown, status-callback wiring, WhatsApp Content-template send).
- **Exceeds prog:** full blast lifecycle (DRAFTED/PROOFED/SCHEDULED/SENDING/SENT/FAILED, proof/schedule/send-now batching, retry-failed, dispatch-due cron, consent + compliance, WhatsApp channel) + delivery/read callback with failure-scope classification and a late-delivered-can't-downgrade-READ guard; GET /calls + /calls/:id.

**Open:**
- *SMS Twilio-callback idempotency claim (layer-3)* — **P1**. `handleTwilioStatusCallback` has no `webhookEvents.claim` (the voice path does); a replay re-runs the projection. *(in tracker)*
- *Transactional-SMS txStatus advance on delivery callback* — **P1**. Callback updates BlastRecipientStatus but never txStatus, so tx rows stick at SENT and the DELIVERED/UNDELIVERED tx-FSM edges are dead. *(in tracker)*
- *Call lifecycle events beyond initiated/completed* — **P1**. RINGING/IN_PROGRESS/BUSY/NO_ANSWER/FAILED update the row but emit no durable event. *(in tracker)*
- *Blast durable outbox events* — **P1**. Blasts emit only in-process `blast.updated`/`blast.retry`; no outbox blast.created/scheduled/sent, so nothing reacts across process boundaries. *(in tracker)*
- *No consumer/reaction for telephony.call.completed (or initiated)* — **P2**. Events produced but dead (one grep hit = the emit). **Tracker miss.**
- *Per-SMS/single-campaign read; MessageTemplate CRUD + type/category/variables/fromNumber + undeclared-var guard; segmentCount capture + callback-driven queued/sent; UNDELIVERED on BlastRecipientStatus* — **P2** each. *(in tracker; note tracker line 25 partially stale — TxSmsStatus.UNDELIVERED exists; the real gap is BlastRecipientStatus collapsing undelivered→FAILED)*

**Architectural stance (NA by design):** Aggregate-backed tracked single-SMS send (POST /messages exists but is a raw passthrough with no ledger/FSM/consent — **a tracker miss in framing**); ES aggregates/replay.

---

## Audience — GAPS_REMAIN (65%)

**At parity in isolation (closed):**
- Segment-evaluation engine — at parity + superset (emailDomain/hasSource/all clauses, include-unwrap, wholesale delete-then-insert rewrite, plus yarns-native consentState/turf and all/any combinators; tenant-scoped). **Engine code is genuinely complete.**
- hasSource clause + `ContactSourceRecord` store (composite-unique, indexed); idempotent single source-record upsert (`recordSourceRecord`); identity resolution (`resolveIdentity` — earliest-createdAt canonical, transitive re-point); Person upsert/canonical spine (`getOrCreate*`, `dedupUpsert`, `mergeContacts` re-pointing all child rows); materialised `AudienceSegmentMember` read consumed by blasts.

**Open — the engine and primitives are unreachable in the running app:**
- *Wire `recordSourceRecord` into Action Network + CSV import* — **P1**. AN sync links **no Contact spine at all** (contactId count = 0); CSV sets contactId but never calls recordSourceRecord. `recordSourceRecord` has **zero production callers** → no ContactSourceRecord rows → hasSource matches nothing. *(in tracker)*
- *Wire `resolveIdentity` into import/create paths* — **P1**. Zero production callers; canonicalContactId stays null in practice. *(in tracker)*
- *Segment write boundary + auto re-evaluate + SEGMENT_EVAL producer* — **P1, most consequential**. `audienceSegment.create/update/delete` = 0 matches; SEGMENT_EVAL queue has a worker consumer but **no producer** and `getSegmentEvalJobId` has no callers — so even a hand-seeded DYNAMIC segment is never (re)evaluated and the complete engine is entirely unreachable. **Tracker miss** — the tracker's "segment read endpoints intentionally skipped" masks that the *whole lifecycle* (write + trigger + read) is absent.
- *ManageSourceRecords remove + batch-reconcile* — **P1**. Upsert-only; dropped upstream records leave orphans so hasSource matches stale members. *(in tracker)*
- *Audience domain events (audience.imported / segment.recomputed)* — **P1**. Catalogued with payload types but never emitted; downstream reactions dead. *(in tracker)*
- *Source-record list/read + provenance in getProfile* — **P2**; *Segment read endpoints over HTTP* — **P2** (only a segment-summary count route exists). *(in tracker)*

**Architectural stance (NA by design):** Event-sourced Person/Segment aggregates + replay; multi-org/tenant-as-aggregate scoping (folded to tenantId-on-row). *parityPercent dropped 68→65 because the complete-but-dead engine plus unwired primitives earn less than their isolated completeness suggests.*

---

## Tracker accuracy

Reconciliation against `docs/meld/12-parity-outstanding.md` is largely accurate — almost every open item is correctly listed, and two prior "tracker miss" flags were **corrected to in-tracker** (Tenant's TenantDeleted event and slug-update path are both in `12-parity-matrix.md`/`12-parity-backlog.md`, just not the narrower outstanding doc). The following OPEN items are genuinely **missing from the outstanding tracker** (`inOutstandingDoc:false`):

1. **Audience — segment lifecycle wholly absent** (P1). The tracker frames this as read endpoints "intentionally skipped"; in fact the write boundary, the SEGMENT_EVAL producer, and the reads are all missing, leaving the verified-complete evaluator unreachable. Recommend rewording to "Segment lifecycle (write boundary + SEGMENT_EVAL producer + read) — absent, P1".
2. **Telephony — no consumer/reaction for telephony.call.completed/initiated** (P2). Events are emitted but have zero subscribers.
3. **Payment — PaymentMethod attach/detach/setDefault write path** (P2). Prog's 3 handlers + one-default-per-customer enforcement are absent; mitigated by the proxied Stripe portal.
4. **Identity — GetUser read-by-id** (DEFERRED, low value). Internal lookup, parity-neutral; flagged for completeness only.
5. **Telephony — aggregate-backed tracked single-SMS send** (DEFERRED, framing). POST /messages exists as a raw passthrough; prog's lifecycle-tracked SendSms has no faithful equivalent.

Two tracker lines are also **partially stale** (not misses, but worth correcting): Email line 28 omits that `email.email.queued` is now emitted; Telephony line 20 understates emission (initiated + completed, not just completed) and line 25's UNDELIVERED gap should be rescoped to `BlastRecipientStatus` (TxSmsStatus.UNDELIVERED already exists). Everything else reconciles.
