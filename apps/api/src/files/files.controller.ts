import { Body, Controller, Delete, Get, Param, Post, Query, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString } from "class-validator";
import { FilesService } from "./files.service";
import { RequirePermission } from "../auth/require-permission.decorator";

// Tenant file manager — owner/admin surface (granted via `manage tenant.all`).
const MANAGE = { action: "manage", resource: "tenant.files" } as const;
const READ = { action: "read", resource: "tenant.files" } as const;

class ListFilesQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() take?: number;
  @IsOptional() @Type(() => Number) @IsInt() skip?: number;
  @IsOptional() @IsString() folder?: string;
}

@Controller("files")
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Get()
  @RequirePermission(READ)
  list(@Query() query: ListFilesQueryDto) {
    return this.files.list(query);
  }

  @Get("summary")
  @RequirePermission(READ)
  summary() {
    return this.files.summary();
  }

  @Post()
  @RequirePermission(MANAGE)
  // Memory storage buffers the whole upload in heap – cap it so oversized
  // bodies are rejected by multer instead of OOMing the process.
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 50 * 1024 * 1024 } }))
  upload(
    @UploadedFile() file: { buffer?: Buffer; originalname?: string; mimetype?: string; size?: number },
    @Body("folder") folder?: string,
  ) {
    return this.files.upload(file, folder);
  }

  @Delete(":id")
  @RequirePermission(MANAGE)
  remove(@Param("id") id: string) {
    return this.files.remove(id);
  }
}
