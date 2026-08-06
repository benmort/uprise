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

/**
 * Soft-delete the tenants a spec created, so a run leaves no workspace behind.
 *
 * These specs create REAL tenants in the target database and, until this existed, abandoned
 * them — a dev database accumulated `e2e-cookie-*` and `e2e-org-*` workspaces that then showed
 * up in the tenant list like customers.
 *
 * Soft, via the app's own DELETE (tenants.service.deleteTenant → sets `deletedAt`, emits
 * tenant.tenant.deleted), not a row delete. Two reasons: every tenant query filters
 * `deletedAt: null`, so the workspace leaves the UI either way; and a cleanup that only ever
 * marks rows cannot cascade a real tenant into oblivion if an id is ever wrong.
 *
 * Best-effort per id: a failed cleanup must never fail a run whose assertions passed.
 */
export async function disposeTenants(
  api: ReturnType<typeof client>,
  ids: Array<string | null | undefined>,
): Promise<void> {
  for (const id of ids) {
    if (!id) continue;
    try {
      await api.del(`/api/v1/tenants/${id}`);
    } catch {
      // Teardown is advisory — swallow so the suite's own result stands.
    }
  }
}

/** Unwrap the ApiResponseInterceptor envelope { ok, data } → data (or the body). */
export function data<T = any>(body: any): T {
  return (body && typeof body === "object" && "data" in body ? body.data : body) as T;
}
