import { Global, Module } from "@nestjs/common";
import { ImageUploadService } from "./image-upload.service";

/**
 * Global so the five upload sites (auth/files/civic/canvassing/telephony) inject the shared
 * uploader without each importing a module — the same pattern as the global Prisma/Config providers.
 */
@Global()
@Module({
  providers: [ImageUploadService],
  exports: [ImageUploadService],
})
export class StorageModule {}
