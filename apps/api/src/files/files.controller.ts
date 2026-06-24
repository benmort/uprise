import { Body, Controller, Delete, Get, Param, Post, Query, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { FilesService } from "./files.service";
import { RequirePermission } from "../auth/require-permission.decorator";

// Tenant file manager — owner/admin surface (granted via `manage tenant.all`).
const MANAGE = { action: "manage", resource: "tenant.files" } as const;
const READ = { action: "read", resource: "tenant.files" } as const;

@Controller("files")
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Get()
  @RequirePermission(READ)
  list(@Query("folder") folder?: string) {
    return this.files.list(folder);
  }

  @Post()
  @RequirePermission(MANAGE)
  @UseInterceptors(FileInterceptor("file"))
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
