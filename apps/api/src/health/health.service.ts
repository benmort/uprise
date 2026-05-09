import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async status() {
    let db = false;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = true;
    } catch {
      db = false;
    }
    return {
      ok: db,
      checks: {
        db,
        twilio: Boolean(
          this.config.get<string>("TWILIO_ACCOUNT_SID") &&
            this.config.get<string>("TWILIO_AUTH_TOKEN") &&
            this.config.get<string>("TWILIO_PHONE_NUMBER"),
        ),
        actionNetwork: Boolean(this.config.get<string>("ACTION_NETWORK_API_KEY")),
        internalSource: Boolean(
          this.config.get<string>("INTERNAL_SOURCE_API_KEY") &&
            this.config.get<string>("INTERNAL_SOURCE_API_BASE_URL"),
        ),
      },
      at: new Date().toISOString(),
    };
  }
}
