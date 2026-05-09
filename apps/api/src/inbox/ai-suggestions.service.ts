import { Injectable } from "@nestjs/common";
import { FeatureFlagsService } from "../common/flags/feature-flags.service";

@Injectable()
export class AiSuggestionsService {
  constructor(private readonly flags: FeatureFlagsService) {}

  suggestReplies(message: string): string[] {
    if (!this.flags.isAiAssistEnabled()) return [];
    const trimmed = message.trim();
    if (!trimmed) return [];
    return [
      "Thanks for reaching out. We have received your message.",
      "Absolutely - I can help with that. Could you confirm your preferred timing?",
      "Got it. I will follow up shortly with an update.",
    ];
  }
}
