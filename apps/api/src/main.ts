import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { configureNestApp } from "./bootstrap";

async function bootstrap() {
  // rawBody enables Stripe webhook signature verification (meld doc 08).
  const app = await NestFactory.create(AppModule, { rawBody: true });
  await configureNestApp(app);
  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3001);
}

bootstrap();
