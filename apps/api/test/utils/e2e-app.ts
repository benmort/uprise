import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../src/app.module";
import { configureNestApp } from "../../src/bootstrap";
import { SeedService } from "../../src/shared-seed/seed.service";

/** Boot the full Nest app configured exactly like production + seed demo data. */
export async function bootE2EApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  await configureNestApp(app);
  await app.init();
  const seed = app.get(SeedService);
  await seed.seedDemo(); // idempotent
  return app;
}

export function authHeader(): string {
  const u = process.env.BASIC_AUTH_USERNAME || "admin";
  const p = process.env.BASIC_AUTH_PASSWORD || "decolonise2026";
  return "Basic " + Buffer.from(`${u}:${p}`).toString("base64");
}

/** A supertest client bound to the app + a default Basic-auth header helper. */
export function client(app: INestApplication) {
  const http = request(app.getHttpServer());
  const auth = authHeader();
  return {
    get: (path: string) => http.get(path).set("Authorization", auth),
    post: (path: string) => http.post(path).set("Authorization", auth),
    patch: (path: string) => http.patch(path).set("Authorization", auth),
    del: (path: string) => http.delete(path).set("Authorization", auth),
    raw: http,
  };
}

/** Unwrap the ApiResponseInterceptor envelope { ok, data } → data (or the body). */
export function data<T = any>(body: any): T {
  return (body && typeof body === "object" && "data" in body ? body.data : body) as T;
}
