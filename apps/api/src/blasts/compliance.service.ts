import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { isWithinQuietHours } from "../common/utils/date.utils";

@Injectable()
export class ComplianceService {
  constructor(private readonly config: ConfigService) {}

  validateMessageForSend(body: string, now = new Date()): { ok: boolean; warnings: string[] } {
    const warnings: string[] = [];
    const requireOptOut = this.config.get<boolean>("REQUIRE_OPTOUT_LANGUAGE", true);
    const quietStart = this.config.get<number>("QUIET_HOURS_START", 21);
    const quietEnd = this.config.get<number>("QUIET_HOURS_END", 8);

    if (requireOptOut && !/reply\s+stop/i.test(body)) {
      warnings.push("Message is missing opt-out language (e.g. Reply STOP to opt out).");
    }
    if (isWithinQuietHours(now, quietStart, quietEnd)) {
      warnings.push("Current local time is inside configured quiet hours.");
    }
    return { ok: warnings.length === 0, warnings };
  }
}
