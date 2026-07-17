import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Min } from "class-validator";

const EVENT_STATUSES = ["DRAFT", "PUBLISHED", "CANCELLED"] as const;
export type EventStatusInput = (typeof EVENT_STATUSES)[number];

export class CreateEventDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsIn(EVENT_STATUSES)
  status?: EventStatusInput;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  pollingPlaceId?: string;

  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;

  @IsString()
  startsAt!: string;

  @IsString()
  endsAt!: string;

  @IsOptional()
  @IsNumber()
  capacity?: number;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  campaignId?: string;

  @IsOptional()
  @IsBoolean()
  publicRsvpEnabled?: boolean;
}

export class UpdateEventDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsIn(EVENT_STATUSES) status?: EventStatusInput;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() pollingPlaceId?: string;
  @IsOptional() @IsNumber() lat?: number;
  @IsOptional() @IsNumber() lng?: number;
  @IsOptional() @IsString() startsAt?: string;
  @IsOptional() @IsString() endsAt?: string;
  @IsOptional() @IsNumber() capacity?: number;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsString() campaignId?: string;
  @IsOptional() @IsBoolean() publicRsvpEnabled?: boolean;
}

/** Organiser recording an RSVP (may link a known contact/volunteer). */
export class RsvpDto {
  @IsString() name!: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() contactId?: string;
  @IsOptional() @IsString() volunteerId?: string;
  @IsOptional() @IsInt() @Min(0) guests?: number;
}

/** Public (tokenless) RSVP submission — no contact/volunteer linkage. */
export class PublicRsvpDto {
  @IsString() name!: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsInt() @Min(0) guests?: number;
}

/** Attendee self-manage: change party size via the manage token. */
export class ManageRsvpDto {
  @IsInt() @Min(0) guests!: number;
}
