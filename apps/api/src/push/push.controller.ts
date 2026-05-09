import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
} from "@nestjs/common";
import { PushService } from "./push.service";

@Controller("push")
export class PushController {
  constructor(private readonly push: PushService) {}

  @Get("stats")
  stats() {
    return { tokenCount: this.push.getTokens().length };
  }

  @Post("register")
  register(@Body() body: { token?: string }) {
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    if (!token) throw new BadRequestException('"token" is required');
    this.push.addToken(token);
    return { ok: true };
  }

  @Post("test")
  async test() {
    if (process.env.NODE_ENV === "production") {
      throw new ForbiddenException("Push test is only available in development");
    }
    const { success, failure } = await this.push.sendToAll(
      { title: "Test", body: "Local test notification" },
      { source: "push-test" },
    );
    return { ok: true, success, failure };
  }
}
