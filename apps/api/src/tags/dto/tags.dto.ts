import { IsOptional, IsString } from "class-validator";

export class CreateTagDto {
  @IsString() label!: string;
  @IsOptional() @IsString() key?: string;
  @IsOptional() @IsString() color?: string;
}

export class AssignTagDto {
  @IsString() tagId!: string;
}
