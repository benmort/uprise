import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Twilio from "twilio";
import { withRetry } from "../common/utils/retry.utils";

export type TwilioCreds = { accountSid: string; authToken: string };

export type ComplianceInput = {
  legalName: string;
  contactFirstName: string;
  contactLastName: string;
  email: string;
  /** AU business identifier (ABN/ACN) — carried in end-user attributes. */
  businessNumber?: string;
  address: {
    street: string;
    city: string;
    region: string; // state, e.g. NSW
    postalCode: string;
  };
};

export type UploadableDocument = {
  fileName: string;
  contentType: string;
  /** Twilio supporting-document type, e.g. "business_registration". */
  type: string;
  content: Buffer;
};

/**
 * Thin wrapper over the Twilio REST surface the provisioning engine uses:
 * subaccounts, addresses, the Regulatory Compliance API (end users, supporting
 * documents, bundles, item assignments) and AU mobile number search/purchase.
 * Every method takes explicit creds — the master account creates subaccounts;
 * everything else runs under the subaccount that will own the number.
 */
@Injectable()
export class TwilioProvisioningClient {
  constructor(private readonly config: ConfigService) {}

  private client(creds?: TwilioCreds): Twilio.Twilio {
    const sid = creds?.accountSid ?? this.config.get<string>("TWILIO_ACCOUNT_SID", "");
    const token = creds?.authToken ?? this.config.get<string>("TWILIO_AUTH_TOKEN", "");
    if (!sid || !token) {
      throw new ServiceUnavailableException("Twilio master credentials are not configured");
    }
    return Twilio(sid, token);
  }

  /** Create a subaccount under the platform MASTER account. */
  async createSubaccount(friendlyName: string): Promise<{ accountSid: string; authToken: string }> {
    const created = await withRetry(
      () => this.client().api.v2010.accounts.create({ friendlyName }),
      { retries: 2 },
    );
    return { accountSid: String(created.sid), authToken: String(created.authToken) };
  }

  async createAddress(creds: TwilioCreds, input: ComplianceInput): Promise<string> {
    const created = await withRetry(
      () =>
        this.client(creds).addresses.create({
          customerName: input.legalName,
          street: input.address.street,
          city: input.address.city,
          region: input.address.region,
          postalCode: input.address.postalCode,
          isoCountry: "AU",
        }),
      { retries: 2 },
    );
    return String(created.sid);
  }

  async createEndUser(creds: TwilioCreds, input: ComplianceInput): Promise<string> {
    const created = await withRetry(
      () =>
        this.client(creds).numbers.v2.regulatoryCompliance.endUsers.create({
          friendlyName: input.legalName,
          type: "business",
          attributes: {
            business_name: input.legalName,
            first_name: input.contactFirstName,
            last_name: input.contactLastName,
            email: input.email,
            ...(input.businessNumber ? { business_registration_number: input.businessNumber } : {}),
          },
        }),
      { retries: 2 },
    );
    return String(created.sid);
  }

  /**
   * Supporting-document upload is multipart; the Node SDK has no file support
   * for this resource, so POST straight to the Regulatory Compliance API.
   */
  async createSupportingDocument(creds: TwilioCreds, doc: UploadableDocument): Promise<string> {
    const form = new FormData();
    form.append("FriendlyName", doc.fileName);
    form.append("Type", doc.type);
    form.append("File", new Blob([new Uint8Array(doc.content)], { type: doc.contentType }), doc.fileName);
    const res = await fetch("https://numbers.twilio.com/v2/RegulatoryCompliance/SupportingDocuments", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString("base64")}`,
      },
      body: form,
    });
    const parsed = (await res.json()) as { sid?: string; message?: string };
    if (!res.ok || !parsed.sid) {
      throw new Error(`Supporting document upload failed (${res.status}): ${parsed.message ?? "unknown"}`);
    }
    return String(parsed.sid);
  }

  /** Create a draft AU-mobile business bundle with a status callback. */
  async createBundle(creds: TwilioCreds, friendlyName: string, email: string, statusCallback: string): Promise<string> {
    const created = await withRetry(
      () =>
        this.client(creds).numbers.v2.regulatoryCompliance.bundles.create({
          friendlyName,
          email,
          isoCountry: "AU",
          numberType: "mobile",
          endUserType: "business",
          statusCallback,
        }),
      { retries: 2 },
    );
    return String(created.sid);
  }

  async assignBundleItem(creds: TwilioCreds, bundleSid: string, objectSid: string): Promise<void> {
    await withRetry(
      () =>
        this.client(creds)
          .numbers.v2.regulatoryCompliance.bundles(bundleSid)
          .itemAssignments.create({ objectSid }),
      { retries: 2 },
    );
  }

  async submitBundle(creds: TwilioCreds, bundleSid: string): Promise<void> {
    await withRetry(
      () =>
        this.client(creds)
          .numbers.v2.regulatoryCompliance.bundles(bundleSid)
          .update({ status: "pending-review" }),
      { retries: 2 },
    );
  }

  async fetchBundleStatus(
    creds: TwilioCreds,
    bundleSid: string,
  ): Promise<{ status: string; failureReason: string | null }> {
    const bundle = await withRetry(
      () => this.client(creds).numbers.v2.regulatoryCompliance.bundles(bundleSid).fetch(),
      { retries: 2 },
    );
    return {
      status: String(bundle.status ?? ""),
      failureReason: (bundle as { failureReason?: string | null }).failureReason ?? null,
    };
  }

  /** First available AU mobile number (throws when inventory is empty — retryable). */
  async findAvailableAuMobile(creds: TwilioCreds): Promise<string> {
    const numbers = await withRetry(
      () => this.client(creds).availablePhoneNumbers("AU").mobile.list({ limit: 1 }),
      { retries: 2 },
    );
    const first = numbers[0]?.phoneNumber;
    if (!first) throw new Error("No AU mobile numbers available to purchase right now");
    return String(first);
  }

  async purchaseNumber(
    creds: TwilioCreds,
    input: { phoneNumber: string; bundleSid: string; addressSid: string; smsUrl: string },
  ): Promise<{ phoneNumberSid: string; phoneNumberE164: string }> {
    const created = await withRetry(
      () =>
        this.client(creds).incomingPhoneNumbers.create({
          phoneNumber: input.phoneNumber,
          bundleSid: input.bundleSid,
          addressSid: input.addressSid,
          smsUrl: input.smsUrl,
          smsMethod: "POST",
        }),
      { retries: 2 },
    );
    return { phoneNumberSid: String(created.sid), phoneNumberE164: String(created.phoneNumber) };
  }

  async configureNumberWebhook(creds: TwilioCreds, phoneNumberSid: string, smsUrl: string): Promise<void> {
    await withRetry(
      () => this.client(creds).incomingPhoneNumbers(phoneNumberSid).update({ smsUrl, smsMethod: "POST" }),
      { retries: 2 },
    );
  }

  async releaseNumber(creds: TwilioCreds, phoneNumberSid: string): Promise<void> {
    await withRetry(() => this.client(creds).incomingPhoneNumbers(phoneNumberSid).remove(), {
      retries: 2,
    });
  }
}
