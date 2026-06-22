import "reflect-metadata";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import express from "express";
import { NestFactory } from "@nestjs/core";
import { ExpressAdapter } from "@nestjs/platform-express";
import type { INestApplication } from "@nestjs/common";
import { AppModule } from "../src/app.module";
import { configureNestApp } from "../src/bootstrap";

const expressServer = express();
let app: INestApplication | null = null;
let appInitPromise: Promise<INestApplication> | null = null;

async function getApp(): Promise<INestApplication> {
  if (app) return app;
  if (!appInitPromise) {
    appInitPromise = (async () => {
      const nestApp = await NestFactory.create(
        AppModule,
        new ExpressAdapter(expressServer),
        // rawBody enables Stripe webhook signature verification on Vercel (meld doc 08).
        { rawBody: true },
      );
      await configureNestApp(nestApp);
      await nestApp.init();
      app = nestApp;
      return nestApp;
    })();
  }
  return appInitPromise;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  await getApp();
  expressServer(req, res);
}
