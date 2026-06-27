# 08 – Payment Domain (net-new)

M2. Net-new payment domain – nothing comparable in uprise. Standalone (no M1 dependency); can run in parallel with M1.

Source: `/Users/benjaminmort/code/prog/core-orchestration/apps/platform/src/services/payment/*` (`payment.aggregate.ts`, `process-webhook.handler.ts`, `StripeAdapter`).

## Models (`payment` schema)

```prisma
enum PaymentStatus { RECORDED PROCESSING SUCCEEDED PARTIALLY_REFUNDED FAILED REFUNDED }  // payment.aggregate.ts:563
enum PaymentType   { SUBSCRIPTION ONE_TIME INVOICE REFUND }

model Payment {
  id             String        @id @default(cuid())
  tenantId       String
  networkId      String?                               // billing boundary above tenant
  amountCents    Int
  currency       String
  customerRef     String?
  status         PaymentStatus @default(RECORDED)
  type           PaymentType
  refundedCents  Int           @default(0)
  subscriptionId String?
  invoiceId      String?
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt
  refunds        Refund[]
  @@index([tenantId, status])
  @@schema("payment")
}

model Refund {
  id                String   @id @default(cuid())
  paymentId         String
  amountCents       Int
  status            String                              // created|processing|succeeded|failed
  processorRefundId String?
  reason            String?
  createdAt         DateTime @default(now())
  payment           Payment  @relation(fields: [paymentId], references: [id])
  @@schema("payment")
}

model Customer        { id String @id @default(cuid()) networkId String? tenantId String? providerCustomerId String @unique email String? @@schema("payment") }
model Subscription    { id String @id @default(cuid()) tenantId String providerSubscriptionId String @unique status String planName String? currentPeriodEnd DateTime? @@schema("payment") }
model Invoice         { id String @id @default(cuid()) tenantId String providerInvoiceId String @unique status String amountCents Int currency String @@schema("payment") }
model PaymentMethod   { id String @id @default(cuid()) customerId String providerMethodId String @unique brand String? last4 String? isDefault Boolean @default(false) @@schema("payment") }
```

`Customer.networkId` keeps the Stripe-customer-per-Network billing boundary from prog (doc 03 tenancy).

## Module

`apps/api/src/payment/`:

- `payment.service.ts` – `recordPayment()`, `markProcessing/Succeeded/Failed`, `refund()`. `refund()` ports prog's `payment.aggregate.ts:642` guard: compute outstanding amount, decide partial (`PARTIALLY_REFUNDED`) vs full (`REFUNDED`), write a `Refund` row, emit outbox `payment.refunded`.
- `payment.controller.ts` – create checkout session + customer-portal session (→ `StripeService`).
- `stripe.service.ts` – net-new adapter (real `stripe` SDK, config-gated, `withRetry`). Port prog's `StripeAdapter` surface: `createCustomer`, `createCheckoutSession`, `createPortalSession`, `attachPaymentMethod`, `detachPaymentMethod`, `setDefaultPaymentMethod`.
- `payment-state.machine.ts` – `PaymentStatus` FSM guard.
- `billing.service.ts` – projects Customer/Subscription/Invoice/PaymentMethod read rows from webhooks.

## Webhook – `/payment-webhook`

Port `process-webhook.handler.ts`:

- Verify Stripe signature via `stripe.webhooks.constructEvent`.
- `claim(provider='stripe', eventId=evt_…)` before acting (doc 12).
- Switch event type → `markProcessing/Succeeded/Failed`; `charge.refunded` → `refund()` + `Refund` row; `customer.subscription.*` / `invoice.paid` → project rows via `billing.service`.

## Worker queue

None – payment is webhook-driven.

## Verification

- FSM unit tests.
- Webhook idempotency: claim-once; replayed event no-ops; `charge.refunded` partial vs full → correct status + `Refund` row.
- e2e: Stripe checkout (Noop double) → webhook → `SUCCEEDED` + projected `Subscription`.

## Files

- `packages/db/prisma/schema.prisma` – payment models + enums.
- `apps/api/src/payment/**` – new module.
- `apps/api/src/webhooks/webhooks.controller.ts` – add `/payment-webhook`.
