-- Payment domain (meld doc 08). Additive: payment schema + Stripe-backed models.
CREATE SCHEMA IF NOT EXISTS "payment";

CREATE TYPE "payment"."PaymentStatus" AS ENUM ('RECORDED', 'PROCESSING', 'SUCCEEDED', 'PARTIALLY_REFUNDED', 'FAILED', 'REFUNDED');
CREATE TYPE "payment"."PaymentType" AS ENUM ('SUBSCRIPTION', 'ONE_TIME', 'INVOICE', 'REFUND');

CREATE TABLE "payment"."Payment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "networkId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "customerRef" TEXT,
    "providerPaymentId" TEXT,
    "status" "payment"."PaymentStatus" NOT NULL DEFAULT 'RECORDED',
    "type" "payment"."PaymentType" NOT NULL,
    "refundedCents" INTEGER NOT NULL DEFAULT 0,
    "subscriptionId" TEXT,
    "invoiceId" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Payment_providerPaymentId_key" ON "payment"."Payment" ("providerPaymentId");
CREATE INDEX "Payment_tenantId_status_idx" ON "payment"."Payment" ("tenantId", "status");

CREATE TABLE "payment"."Refund" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "processorRefundId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Refund_paymentId_idx" ON "payment"."Refund" ("paymentId");
ALTER TABLE "payment"."Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payment"."Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "payment"."Customer" (
    "id" TEXT NOT NULL, "networkId" TEXT, "tenantId" TEXT,
    "providerCustomerId" TEXT NOT NULL, "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Customer_providerCustomerId_key" ON "payment"."Customer" ("providerCustomerId");

CREATE TABLE "payment"."Subscription" (
    "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "providerSubscriptionId" TEXT NOT NULL,
    "status" TEXT NOT NULL, "planName" TEXT, "currentPeriodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Subscription_providerSubscriptionId_key" ON "payment"."Subscription" ("providerSubscriptionId");

CREATE TABLE "payment"."Invoice" (
    "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "providerInvoiceId" TEXT NOT NULL,
    "status" TEXT NOT NULL, "amountCents" INTEGER NOT NULL, "currency" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Invoice_providerInvoiceId_key" ON "payment"."Invoice" ("providerInvoiceId");

CREATE TABLE "payment"."PaymentMethod" (
    "id" TEXT NOT NULL, "customerId" TEXT NOT NULL, "providerMethodId" TEXT NOT NULL,
    "brand" TEXT, "last4" TEXT, "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PaymentMethod_providerMethodId_key" ON "payment"."PaymentMethod" ("providerMethodId");
CREATE INDEX "PaymentMethod_customerId_idx" ON "payment"."PaymentMethod" ("customerId");
