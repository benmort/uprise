-- Block duplicate refunds (meld doc 08 review fix): one Refund per
-- (paymentId, processorRefundId). NULL processorRefundId stays distinct so
-- multiple manual refunds per payment remain allowed.
CREATE UNIQUE INDEX "Refund_paymentId_processorRefundId_key" ON "payment"."Refund" ("paymentId", "processorRefundId");
