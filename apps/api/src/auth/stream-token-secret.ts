import { ConfigService } from "@nestjs/config";

export type StreamTokenSecretSource =
  | "STREAM_TOKEN_SECRET"
  | "INTEGRATION_CREDENTIAL_SECRET";

export function resolveStreamTokenSecret(
  config: ConfigService,
): { secret: string; source: StreamTokenSecretSource | null } {
  const streamSecret = (config.get<string>("STREAM_TOKEN_SECRET") || "").trim();
  if (streamSecret) {
    return { secret: streamSecret, source: "STREAM_TOKEN_SECRET" };
  }
  const fallbackSecret = (config.get<string>("INTEGRATION_CREDENTIAL_SECRET") || "").trim();
  if (fallbackSecret) {
    return { secret: fallbackSecret, source: "INTEGRATION_CREDENTIAL_SECRET" };
  }
  return { secret: "", source: null };
}
