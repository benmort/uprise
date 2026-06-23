import { Body, Controller, Post } from "@nestjs/common";
import { IsEmail, IsOptional, IsString, MaxLength } from "class-validator";
import { MarketingService } from "./marketing.service";

class ContactDto {
  @IsString() @MaxLength(200) name!: string;
  @IsEmail() @MaxLength(200) email!: string;
  @IsOptional() @IsString() @MaxLength(200) company?: string;
  @IsOptional() @IsString() @MaxLength(200) subject?: string;
  @IsString() @MaxLength(5000) message!: string;
}
class DemoRequestDto {
  @IsString() @MaxLength(200) name!: string;
  @IsEmail() @MaxLength(200) email!: string;
  @IsOptional() @IsString() @MaxLength(200) company?: string;
  @IsOptional() @IsString() @MaxLength(120) role?: string;
  @IsOptional() @IsString() @MaxLength(2000) useCase?: string;
  @IsOptional() @IsString() @MaxLength(120) timeline?: string;
  @IsOptional() @IsString() @MaxLength(2000) additionalInfo?: string;
}
class NewsletterDto {
  @IsEmail() @MaxLength(200) email!: string;
}

/**
 * Public marketing form intake (meld doc 12). Guard-allowlisted (pre-tenant, no auth).
 */
@Controller("marketing")
export class MarketingController {
  constructor(private readonly marketing: MarketingService) {}

  @Post("contact")
  contact(@Body() dto: ContactDto) {
    return this.marketing.submitContact(dto);
  }

  @Post("demo-request")
  demoRequest(@Body() dto: DemoRequestDto) {
    return this.marketing.requestDemo(dto);
  }

  @Post("newsletter")
  newsletter(@Body() dto: NewsletterDto) {
    return this.marketing.newsletterSignup(dto);
  }
}
