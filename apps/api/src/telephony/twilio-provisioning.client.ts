import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Twilio from "twilio";
import { withRetry } from "../common/utils/retry.utils";
import { twilioRegionOptions } from "../twilio/twilio-region";

export type TwilioCreds = {
  accountSid: string;
  authToken: string;
  /**
   * Twilio home region of the account, e.g. "au1". A property of the ACCOUNT, not of the
   * platform – a BYO account can be regional while the platform master is not. Null/absent
   * means the default (us1) routing, i.e. exactly what every account did before this field
   * existed.
   */
  region?: string | null;
  /** Twilio edge, e.g. "sydney". Absent with a region ⇒ the region's default edge. */
  edge?: string | null;
};

/**
 * What an operator-supplied regulatory bundle actually IS, read from Twilio rather than
 * taken on trust. `numberType`/`isoCountry` come from the bundle's REGULATION (the bundle
 * resource itself only names a `regulationSid`), and are null when that lookup could not be
 * made – the caller must treat null as "unknown", never as "matches".
 */
export type BundleFacts = {
  status: string;
  numberType: string | null;
  isoCountry: string | null;
};

export type ComplianceInput = {
  legalName: string;
  contactFirstName: string;
  contactLastName: string;
  email: string;
  /** AU business identifier (ABN/ACN) — carried in end-user attributes. */
  businessNumber?: string;
  /**
   * The org's legal structure, in uprise's own vocabulary (`charity`,
   * `incorporated_association`, …). Translated to Twilio's `business_type` enum by
   * {@link twilioBusinessType} — it is NOT passed through raw.
   */
  entityType?: string;
  address: {
    street: string;
    city: string;
    region: string; // state, e.g. NSW
    postalCode: string;
  };
};

/**
 * uprise entity type → Twilio regulatory `business_type`.
 *
 * The two vocabularies are not the same: uprise collects AU legal structures from its own
 * select (`ENTITY_TYPE_OPTIONS` in the admin credentials form), Twilio accepts a fixed
 * enum on the end-user's attributes. Unmapped values are OMITTED rather than guessed —
 * a value Twilio does not recognise risks a rejected bundle a human reviews days later,
 * which is strictly worse than the attribute being absent (its long-standing state).
 */
const TWILIO_BUSINESS_TYPE: Readonly<Record<string, string>> = {
  charity: "non_profit_corporation",
  incorporated_association: "non_profit_corporation",
  company_limited_by_guarantee: "non_profit_corporation",
  atsi_corporation: "non_profit_corporation",
  cooperative: "co_operative",
  trust: "trust",
  // Deliberately absent: `unincorporated_association`, `political_party`, `other` — no
  // confident Twilio equivalent, so nothing is sent for them.
};

export function twilioBusinessType(entityType?: string): string | undefined {
  const key = (entityType ?? "").trim().toLowerCase();
  return key ? TWILIO_BUSINESS_TYPE[key] : undefined;
}

/**
 * The inbound hook a provisioned number is configured with. It is a UNION, not two optional
 * fields, because the classes are mutually exclusive: an AU local number cannot receive SMS
 * and an AU mobile is not a voice caller ID. Which arm applies is the service's decision
 * (`numberWebhooks`); the client only carries it to Twilio.
 *
 * The optional fields beyond the URL are there for ADOPTION, where the hook is rarely blank.
 * A TwiML application OVERRIDES the URL on the same hook at Twilio, and a `trunkSid` overrides
 * voice routing entirely, so a number carrying either would keep routing where it always did
 * no matter what URL we write; the fallback URL keeps receiving traffic whenever ours errors.
 * Claiming a hook therefore has to clear all of them on THAT hook in the same update – and
 * only that one, so the other class's configuration is untouched. `""` is Twilio's "unset",
 * which is also why these are plain strings rather than nullable: restoring a hook writes the
 * previous value back, or `""` where there was none.
 */
export type NumberWebhooks =
  | { smsUrl: string; smsMethod: "POST"; smsApplicationSid?: string; smsFallbackUrl?: string }
  | {
      voiceUrl: string;
      voiceMethod: "POST";
      voiceApplicationSid?: string;
      voiceFallbackUrl?: string;
      trunkSid?: string;
    };

/**
 * A number the account ALREADY owns, as Twilio reports it.
 *
 * The current configuration is part of the read, not an afterthought: a BYO account's numbers
 * are usually already wired to something the organisation depends on, and uprise cannot decide
 * whether adopting one is safe without seeing what is there. Every routing field Twilio honours
 * is read, not just the primary URL – an application SID with a blank URL is a CONFIGURED hook,
 * a `trunkSid` sends voice to a SIP trunk and ignores the URL altogether, and a fallback URL
 * keeps taking traffic whenever the primary errors. A reader that only looked at the two
 * primary URLs would call all three of those free.
 */
export type OwnedNumber = {
  phoneNumberE164: string;
  phoneNumberSid: string;
  friendlyName: string | null;
  /** What Twilio says the number can actually do – the authority on capability. */
  capabilities: { voice: boolean; sms: boolean; mms: boolean };
  voiceUrl: string | null;
  voiceApplicationSid: string | null;
  voiceFallbackUrl: string | null;
  /** Elastic SIP trunk the number's voice is bound to; overrides `voiceUrl` at Twilio. */
  trunkSid: string | null;
  smsUrl: string | null;
  smsApplicationSid: string | null;
  smsFallbackUrl: string | null;
};

/** Twilio resource shape for an incoming phone number (only the fields adoption reads). */
type TwilioIncomingNumber = {
  sid?: string;
  phoneNumber?: string;
  friendlyName?: string | null;
  capabilities?: { voice?: boolean; sms?: boolean; mms?: boolean } | null;
  voiceUrl?: string | null;
  voiceApplicationSid?: string | null;
  voiceFallbackUrl?: string | null;
  trunkSid?: string | null;
  smsUrl?: string | null;
  smsApplicationSid?: string | null;
  smsFallbackUrl?: string | null;
};

/** Empty string is Twilio's "unset", so it is normalised to null here rather than at each reader. */
const orNull = (value: string | null | undefined): string | null => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed : null;
};

const toOwnedNumber = (n: TwilioIncomingNumber): OwnedNumber => ({
  phoneNumberE164: String(n.phoneNumber ?? ""),
  phoneNumberSid: String(n.sid ?? ""),
  friendlyName: orNull(n.friendlyName),
  // Absent capabilities are read as FALSE, never as true: a number uprise cannot prove is
  // SMS-capable must not be adopted as an SMS sender.
  capabilities: {
    voice: n.capabilities?.voice === true,
    sms: n.capabilities?.sms === true,
    mms: n.capabilities?.mms === true,
  },
  voiceUrl: orNull(n.voiceUrl),
  voiceApplicationSid: orNull(n.voiceApplicationSid),
  voiceFallbackUrl: orNull(n.voiceFallbackUrl),
  trunkSid: orNull(n.trunkSid),
  smsUrl: orNull(n.smsUrl),
  smsApplicationSid: orNull(n.smsApplicationSid),
  smsFallbackUrl: orNull(n.smsFallbackUrl),
});

/**
 * A Twilio "no such resource on this account" answer. It is a FACT, not a fault: it is how
 * ownership is proved, so it must neither be retried nor confused with an outage or a bad
 * credential – both of which have to surface as errors rather than as "not yours".
 */
/**
 * How many owned numbers one `listOwnedNumbers` call will page through. Far above any real
 * BYO account (the account this was built for holds single digits), so the ceiling is a
 * runaway guard rather than a page size an operator could hit.
 */
const OWNED_NUMBER_PAGE_CEILING = 1000;

const isTwilioNotFound = (error: unknown): boolean => {
  const e = error as { status?: number; code?: number } | null;
  return e?.status === 404 || e?.code === 20404;
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
    // The third argument is omitted (not passed as `{}`) when the account is not regional,
    // so a non-regional account constructs its client exactly as it did before. An edge with
    // no region is ignored rather than half-applied – `twilioRegionOptions` owns that rule,
    // so the SDK client and `regulatoryHost` below can never disagree about where a given
    // account's requests go.
    const options = twilioRegionOptions(creds?.region, creds?.edge);
    return options ? Twilio(sid, token, options) : Twilio(sid, token);
  }

  /**
   * The regulatory-compliance host for these creds.
   *
   * The SDK rewrites every request host to `<product>.<edge>.<region>.twilio.com` for a
   * regional account (`BaseTwilio.getHostname`). `createSupportingDocument` is the one call
   * that bypasses the SDK – multipart upload, which the Node client has no support for – so
   * it has to apply the same rule by hand. Without it a regional (au1) account uploads its
   * supporting documents into us1, where the bundle they belong to cannot see them, and the
   * bundle is rejected days later by a human reviewer with nothing useful to read.
   */
  private regulatoryHost(creds: TwilioCreds): string {
    const options = twilioRegionOptions(creds.region, creds.edge);
    if (!options) return "numbers.twilio.com";
    return ["numbers", options.edge, options.region, "twilio.com"].filter(Boolean).join(".");
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
            ...(twilioBusinessType(input.entityType)
              ? { business_type: twilioBusinessType(input.entityType) }
              : {}),
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
    const res = await fetch(`https://${this.regulatoryHost(creds)}/v2/RegulatoryCompliance/SupportingDocuments`, {
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

  /** Create a draft AU business bundle (mobile or local regulation) with a status callback. */
  async createBundle(
    creds: TwilioCreds,
    friendlyName: string,
    email: string,
    statusCallback: string,
    numberType: "mobile" | "local" = "mobile",
  ): Promise<string> {
    const created = await withRetry(
      () =>
        this.client(creds).numbers.v2.regulatoryCompliance.bundles.create({
          friendlyName,
          email,
          isoCountry: "AU",
          numberType,
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

  /**
   * What a bundle IS, under these credentials: its review status and the regulation class
   * it was approved for.
   *
   * This is the only way to learn the class of a bundle uprise did not create. The bundle
   * resource carries a `regulationSid`, not a `numberType` – the class and country live on
   * the Regulation – so this is two calls. A failure to read the REGULATION is not fatal
   * (null ⇒ unknown, and the caller decides); a failure to read the BUNDLE is, and throws,
   * because it means the SID does not exist on this account.
   */
  async fetchBundleFacts(creds: TwilioCreds, bundleSid: string): Promise<BundleFacts> {
    const bundle = await withRetry(
      () => this.client(creds).numbers.v2.regulatoryCompliance.bundles(bundleSid).fetch(),
      { retries: 2 },
    );
    const regulationSid = String((bundle as { regulationSid?: string }).regulationSid ?? "");
    let numberType: string | null = null;
    let isoCountry: string | null = null;
    if (regulationSid) {
      try {
        const regulation = await this.client(creds)
          .numbers.v2.regulatoryCompliance.regulations(regulationSid)
          .fetch();
        numberType = regulation.numberType ? String(regulation.numberType) : null;
        isoCountry = regulation.isoCountry ? String(regulation.isoCountry) : null;
      } catch {
        // Unknown, not mismatched. Swallowed deliberately: an outage on the regulation
        // lookup must not block a bundle Twilio has plainly already approved.
        numberType = null;
        isoCountry = null;
      }
    }
    return { status: String(bundle.status ?? ""), numberType, isoCountry };
  }

  /** The country a registered address belongs to (throws when the SID is not on the account). */
  async fetchAddressCountry(creds: TwilioCreds, addressSid: string): Promise<string | null> {
    const address = await withRetry(() => this.client(creds).addresses(addressSid).fetch(), {
      retries: 2,
    });
    return address.isoCountry ? String(address.isoCountry) : null;
  }

  /** First available AU number of the given type (throws when inventory is empty — retryable). */
  async findAvailableAuNumber(creds: TwilioCreds, numberType: "mobile" | "local" = "mobile"): Promise<string> {
    const numbers = await withRetry<Array<{ phoneNumber?: string }>>(
      () =>
        numberType === "local"
          ? this.client(creds).availablePhoneNumbers("AU").local.list({ limit: 1 })
          : this.client(creds).availablePhoneNumbers("AU").mobile.list({ limit: 1 }),
      { retries: 2 },
    );
    const first = numbers[0]?.phoneNumber;
    if (!first) throw new Error(`No AU ${numberType} numbers available to purchase right now`);
    return String(first);
  }

  /** Back-compat alias for the historical mobile-only flow. */
  async findAvailableAuMobile(creds: TwilioCreds): Promise<string> {
    return this.findAvailableAuNumber(creds, "mobile");
  }

  /**
   * Every number the account ALREADY owns, with its capabilities and current configuration.
   *
   * This is the read that makes adoption possible: a tenant's BYO account routinely holds
   * numbers it has already paid for and regulated, and without this list the only way one
   * enters uprise is by buying another.
   *
   * `limit` is a ceiling on the SDK's auto-paging, and it is set high deliberately: the whole
   * premise of adoption is an account holding piles of inventory, and a list that silently
   * stopped short would show the operator a missing number as one Twilio does not report.
   */
  async listOwnedNumbers(creds: TwilioCreds, limit = OWNED_NUMBER_PAGE_CEILING): Promise<OwnedNumber[]> {
    const numbers = await withRetry<TwilioIncomingNumber[]>(
      () => this.client(creds).incomingPhoneNumbers.list({ limit }),
      { retries: 2 },
    );
    return numbers.map(toOwnedNumber);
  }

  /**
   * One owned number, or null when this account does not own that SID.
   *
   * Null is the ownership verdict, which is why adoption fetches instead of trusting the
   * caller: the fetch runs under the ACCOUNT's own credentials, so a SID belonging to anyone
   * else cannot resolve. Only a genuine not-found becomes null – an auth failure or an outage
   * still throws, because "we could not ask" must never read as "not yours".
   */
  async fetchOwnedNumber(creds: TwilioCreds, phoneNumberSid: string): Promise<OwnedNumber | null> {
    try {
      const number = await withRetry<TwilioIncomingNumber>(
        () => this.client(creds).incomingPhoneNumbers(phoneNumberSid).fetch(),
        // A not-found is a settled answer; retrying it only delays the refusal.
        { retries: 2, shouldRetry: (error) => !isTwilioNotFound(error) },
      );
      return toOwnedNumber(number);
    } catch (error) {
      if (isTwilioNotFound(error)) return null;
      throw error;
    }
  }

  async purchaseNumber(
    creds: TwilioCreds,
    input: { phoneNumber: string; bundleSid: string; addressSid: string; webhooks: NumberWebhooks },
  ): Promise<{ phoneNumberSid: string; phoneNumberE164: string }> {
    const created = await withRetry(
      () =>
        this.client(creds).incomingPhoneNumbers.create({
          phoneNumber: input.phoneNumber,
          bundleSid: input.bundleSid,
          addressSid: input.addressSid,
          ...input.webhooks,
        }),
      { retries: 2 },
    );
    return { phoneNumberSid: String(created.sid), phoneNumberE164: String(created.phoneNumber) };
  }

  async configureNumberWebhook(
    creds: TwilioCreds,
    phoneNumberSid: string,
    webhooks: NumberWebhooks,
  ): Promise<void> {
    await withRetry(
      () => this.client(creds).incomingPhoneNumbers(phoneNumberSid).update({ ...webhooks }),
      { retries: 2 },
    );
  }

  async releaseNumber(creds: TwilioCreds, phoneNumberSid: string): Promise<void> {
    await withRetry(() => this.client(creds).incomingPhoneNumbers(phoneNumberSid).remove(), {
      retries: 2,
    });
  }
}
