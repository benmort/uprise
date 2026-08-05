import { ValidationPipe } from "@nestjs/common";
import { validate } from "class-validator";
import { AcceptInviteDto, OpenJoinAcceptDto } from "./auth-flows.dto";

const acceptDto = (patch: Record<string, unknown>) =>
  validate(Object.assign(new AcceptInviteDto(), { token: "tok", ...patch }));

/**
 * The global pipe from bootstrap.ts. `forbidNonWhitelisted` is the setting that turns an
 * undeclared property into a 400 rather than silently dropping it, so it has to be exercised
 * through a real pipe — plain `validate()` cannot see it.
 */
const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });
const throughPipe = (metatype: new () => object, body: Record<string, unknown>) =>
  pipe.transform(body, { type: "body", metatype });

describe("AcceptInviteDto", () => {
  it("accepts a bare token", async () => {
    expect(await acceptDto({})).toHaveLength(0);
  });

  it("rejects a password shorter than 8 characters", async () => {
    expect((await acceptDto({ password: "short" })).length).toBeGreaterThan(0);
    expect(await acceptDto({ password: "longenough" })).toHaveLength(0);
  });

  it("rejects an unknown preferredRole, walkingCapability or sessionLength", async () => {
    expect((await acceptDto({ preferredRole: "wizard" })).length).toBeGreaterThan(0);
    expect((await acceptDto({ walkingCapability: "teleport" })).length).toBeGreaterThan(0);
    expect((await acceptDto({ sessionLength: "forever" })).length).toBeGreaterThan(0);
  });

  it("rejects more than seven availability days", async () => {
    expect(await acceptDto({ availabilityDays: ["mon", "tue"] })).toHaveLength(0);
    expect((await acceptDto({ availabilityDays: Array(8).fill("mon") })).length).toBeGreaterThan(0);
  });

  /**
   * Regression: the onboarding wizard spreads captureAttribution() into the accept body, but
   * these fields were undeclared. With `forbidNonWhitelisted` that is a 400 — so every invite
   * or open-join link carrying ?utm_source= / ?source= / ?ref= failed at the final step and
   * left the invitation `pending`. The attribution persists in sessionStorage, so it kept
   * failing for the rest of the session.
   */
  it("accepts the signup attribution the onboarding wizard sends", async () => {
    await expect(
      throughPipe(AcceptInviteDto, {
        token: "tok",
        displayName: "Jay",
        password: "longenough",
        signupSource: "campaign-email",
        utmSource: "facebook",
        utmMedium: "social",
        utmCampaign: "spring-doorknock",
        referrerChannel: "partner",
      }),
    ).resolves.toMatchObject({ utmSource: "facebook", referrerChannel: "partner" });
  });

  it("still rejects a genuinely unknown property", async () => {
    await expect(throughPipe(AcceptInviteDto, { token: "tok", nonsense: "x" })).rejects.toThrow();
  });
});

describe("OpenJoinAcceptDto", () => {
  it("accepts the signup attribution too (same wizard, tokenless path)", async () => {
    await expect(
      throughPipe(OpenJoinAcceptDto, {
        campaignId: "c1",
        displayName: "Jay",
        utmSource: "facebook",
        referrerChannel: "partner",
      }),
    ).resolves.toMatchObject({ utmSource: "facebook" });
  });

  it("still rejects a genuinely unknown property", async () => {
    await expect(
      throughPipe(OpenJoinAcceptDto, { campaignId: "c1", nonsense: "x" }),
    ).rejects.toThrow();
  });
});
