import { Injectable, Logger } from "@nestjs/common";
import * as admin from "firebase-admin";

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly tokens = new Map<string, { updatedAt: number }>();

  addToken(token: string): void {
    if (typeof token === "string" && token.trim()) {
      this.tokens.set(token.trim(), { updatedAt: Date.now() });
    }
  }

  removeToken(token: string): void {
    this.tokens.delete(token.trim());
  }

  getTokens(): string[] {
    return Array.from(this.tokens.keys());
  }

  private ensureAdmin(): boolean {
    if (admin.apps.length > 0) return true;
    let credential: admin.credential.Credential | undefined;

    const jsonB64 = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_B64;
    const jsonRaw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (jsonB64) {
      try {
        const buf = Buffer.from(jsonB64, "base64");
        credential = admin.credential.cert(JSON.parse(buf.toString("utf8")) as admin.ServiceAccount);
      } catch {
        return false;
      }
    } else if (jsonRaw) {
      try {
        credential = admin.credential.cert(JSON.parse(jsonRaw) as admin.ServiceAccount);
      } catch {
        return false;
      }
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      try {
        credential = admin.credential.applicationDefault();
      } catch {
        return false;
      }
    }

    if (!credential) return false;
    try {
      admin.initializeApp({ credential });
      return true;
    } catch {
      return false;
    }
  }

  async sendToAll(
    notification: { title: string; body?: string },
    data?: Record<string, string>,
  ): Promise<{ success: number; failure: number }> {
    const list = this.getTokens();
    if (list.length === 0) return { success: 0, failure: 0 };
    if (!this.ensureAdmin()) return { success: 0, failure: list.length };

    const payload: admin.messaging.MulticastMessage = {
      tokens: list,
      data: { title: notification.title, body: notification.body ?? "", ...(data || {}) },
    };

    try {
      const res = await admin.messaging().sendEachForMulticast(payload);
      let success = 0;
      let failure = 0;
      res.responses.forEach((r, i) => {
        if (r.success) {
          success += 1;
          return;
        }
        failure += 1;
        const code = r.error?.code ?? "unknown";
        if (code === "messaging/invalid-registration-token" || code === "messaging/registration-token-not-registered") {
          this.tokens.delete(list[i]);
        }
      });
      return { success, failure };
    } catch (error) {
      this.logger.warn(`sendToAll failed: ${String(error)}`);
      return { success: 0, failure: list.length };
    }
  }
}
