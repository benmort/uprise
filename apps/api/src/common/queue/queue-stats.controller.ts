import { Controller, Get } from "@nestjs/common";
import { QueueStatsService } from "./queue-stats.service";

@Controller("system")
export class QueueStatsController {
  constructor(private readonly queueStats: QueueStatsService) {}

  @Get("queue-stats")
  getQueueStats() {
    return this.queueStats.getStats();
  }
}
