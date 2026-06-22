import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import webpush from "web-push";
import { PrismaService } from "../prisma/prisma.service";

export type PushSubscriptionInput = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
};

/**
 * Web-push to field canvassers. Gated on FEATURE_PUSH_ENABLED + VAPID keys — when
 * unconfigured, subscribe/broadcast no-op cleanly so nothing throws in dev/prod.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly enabled: boolean;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const pub = this.config.get<string>("VAPID_PUBLIC_KEY", "");
    const priv = this.config.get<string>("VAPID_PRIVATE_KEY", "");
    const subject = this.config.get<string>("VAPID_SUBJECT", "mailto:hello@yarns.app");
    this.enabled = this.config.get<boolean>("FEATURE_PUSH_ENABLED", false) && Boolean(pub && priv);
    if (this.enabled) webpush.setVapidDetails(subject, pub, priv);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async subscribe(tenantId: string, userId: string | null, sub: PushSubscriptionInput) {
    return this.prisma.pushSubscription.upsert({
      where: { tenantId_endpoint: { tenantId, endpoint: sub.endpoint } },
      update: { p256dh: sub.keys.p256dh, auth: sub.keys.auth, userId, userAgent: sub.userAgent ?? null },
      create: {
        tenantId,
        userId,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        userAgent: sub.userAgent ?? null,
      },
    });
  }

  /** Send a notification to every subscription in the org. Prunes dead (404/410) subs. */
  async broadcast(tenantId: string, payload: { title: string; body: string; url?: string }) {
    if (!this.enabled) return { sent: 0, pruned: 0, enabled: false };
    const subs = await this.prisma.pushSubscription.findMany({ where: { tenantId } });
    const body = JSON.stringify(payload);
    let sent = 0;
    const dead: string[] = [];
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            body,
          );
          sent += 1;
        } catch (err) {
          const code = (err as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) dead.push(s.id);
          else this.logger.warn(`push send failed for ${s.id}: ${String(err)}`);
        }
      }),
    );
    if (dead.length) await this.prisma.pushSubscription.deleteMany({ where: { id: { in: dead } } });
    return { sent, pruned: dead.length, enabled: true };
  }
}
