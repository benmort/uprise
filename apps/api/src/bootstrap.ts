import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ApiExceptionFilter } from "./common/http/api-exception.filter";
import { ApiResponseInterceptor } from "./common/http/api-response.interceptor";
import { RequestLoggingInterceptor } from "./common/logging/request-logging.interceptor";
import { DomainLogger } from "./common/logging/domain-logger.service";
import { PrismaService } from "./prisma/prisma.service";
import { ConfigService } from "@nestjs/config";

export function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, "").toLowerCase();
}

export function parseAllowedOrigins(rawOrigins: string): Set<string> {
  return new Set(
    rawOrigins
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => normalizeOrigin(value)),
  );
}

export async function configureNestApp(app: INestApplication): Promise<void> {
  const config = app.get(ConfigService);
  const configuredOrigins = parseAllowedOrigins(config.get<string>("CORS_ALLOWED_ORIGINS", ""));
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (configuredOrigins.size === 0) {
        callback(null, true);
        return;
      }
      callback(null, configuredOrigins.has(normalizeOrigin(origin)));
    },
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "Accept", "Origin", "X-Requested-With"],
    optionsSuccessStatus: 204,
    maxAge: 600,
  });
  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter(app.get(DomainLogger)));
  app.useGlobalInterceptors(
    new ApiResponseInterceptor(),
    new RequestLoggingInterceptor(app.get(DomainLogger)),
  );

  const prisma = app.get(PrismaService);
  await prisma.enableShutdownHooks(app);
}
