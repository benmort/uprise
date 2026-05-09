import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ApiExceptionFilter } from "./common/http/api-exception.filter";
import { ApiResponseInterceptor } from "./common/http/api-response.interceptor";
import { RequestLoggingInterceptor } from "./common/logging/request-logging.interceptor";
import { DomainLogger } from "./common/logging/domain-logger.service";
import { PrismaService } from "./prisma/prisma.service";
import { ConfigService } from "@nestjs/config";

export async function configureNestApp(app: INestApplication): Promise<void> {
  const config = app.get(ConfigService);
  const configuredOrigins = config
    .get<string>("CORS_ALLOWED_ORIGINS", "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  app.enableCors({
    origin:
      configuredOrigins.length === 0
        ? true
        : (origin, callback) => {
            if (!origin || configuredOrigins.includes(origin)) {
              callback(null, true);
              return;
            }
            callback(new Error("CORS origin blocked"), false);
          },
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
