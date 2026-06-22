import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { IsArray, IsIn, IsOptional, IsString, MaxLength, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { PaymentService } from "./payment.service";
import { StripeService } from "./stripe.service";
import { RequirePermission } from "../auth/require-permission.decorator";

class LineItemDto {
  @IsString() @MaxLength(120) price!: string;
  @Type(() => Number) quantity!: number;
}
class CheckoutSessionDto {
  @IsIn(["payment", "subscription"]) mode!: "payment" | "subscription";
  @IsString() @MaxLength(2048) successUrl!: string;
  @IsString() @MaxLength(2048) cancelUrl!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => LineItemDto) lineItems!: LineItemDto[];
  @IsOptional() @IsString() @MaxLength(120) customer?: string;
}
class PortalSessionDto {
  @IsString() @MaxLength(120) customer!: string;
  @IsString() @MaxLength(2048) returnUrl!: string;
}

// Billing is an owner/super-admin surface (manage payment.all). Reads use read payment.all.
const MANAGE = { action: "manage", resource: "payment.all" } as const;
const READ = { action: "read", resource: "payment.all" } as const;

@Controller("payment")
export class PaymentController {
  constructor(
    private readonly payment: PaymentService,
    private readonly stripe: StripeService,
  ) {}

  @Get("health")
  @RequirePermission(READ)
  health() {
    return { configured: this.stripe.isConfigured() };
  }

  @Post("checkout-session")
  @RequirePermission(MANAGE)
  checkout(@Body() dto: CheckoutSessionDto) {
    return this.stripe.createCheckoutSession(dto);
  }

  @Post("portal-session")
  @RequirePermission(MANAGE)
  portal(@Body() dto: PortalSessionDto) {
    return this.stripe.createPortalSession(dto);
  }

  @Get("payments")
  @RequirePermission(READ)
  payments() {
    return this.payment.listPayments();
  }

  @Get("payments/:id")
  @RequirePermission(READ)
  getPayment(@Param("id") id: string) {
    return this.payment.getPayment(id);
  }

  @Get("payments/:id/refunds")
  @RequirePermission(READ)
  refunds(@Param("id") id: string) {
    return this.payment.listRefunds(id);
  }

  @Get("invoices")
  @RequirePermission(READ)
  invoices() {
    return this.payment.listInvoices();
  }

  @Get("subscriptions")
  @RequirePermission(READ)
  subscriptions() {
    return this.payment.listSubscriptions();
  }

  @Get("payment-methods")
  @RequirePermission(READ)
  paymentMethods() {
    return this.payment.listPaymentMethods();
  }
}
