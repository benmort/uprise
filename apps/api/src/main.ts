import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { configureNestApp } from "./bootstrap";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await configureNestApp(app);
  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3001);
}

bootstrap();
