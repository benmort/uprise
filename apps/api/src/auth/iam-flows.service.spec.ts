import { IamFlowsService } from "./iam-flows.service";
import { hashPassword } from "./password.util";

function setup() {
  const prisma: any = {
    user: {
      findUnique: jest.fn(async () => null),
      create: jest.fn(async ({ data }: any) => ({ id: "newuser", ...data })),
      update: jest.fn(async () => ({})),
    },
    tenant: {
      findUnique: jest.fn(async () => ({ id: "t1", name: "Org One" })),
      findFirst: jest.fn(async () => ({ id: "t1", name: "Org One", slug: "org-one" })),
      upsert: jest.fn(async () => ({ id: "t1", name: "Org One" })),
    },
    tenantJoinRequest: {
      findFirst: jest.fn(async () => null),
      findUnique: jest.fn(async () => null),
      create: jest.fn(async () => ({ id: "jr1" })),
      update: jest.fn(async () => ({ id: "jr1" })),
      upsert: jest.fn(async () => ({ id: "jr1" })),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    tenantMember: {
      findFirst: jest.fn(async () => ({ tenantId: "t1", role: "ORGANISER" })),
      findMany: jest.fn(async () => [{ tenantId: "t1", role: "ORGANISER", tenant: { name: "Org One" } }]),
      findUnique: jest.fn(async () => ({ tenantId: "t1", userId: "u1", role: "ORGANISER" })),
      count: jest.fn(async () => 2),
      deleteMany: jest.fn(async () => ({ count: 1 })),
      upsert: jest.fn(async () => ({})),
    },
    tenantInvitation: {
      findUnique: jest.fn(async () => null),
      update: jest.fn(async () => ({})),
    },
    canvassCampaign: {
      findUnique: jest.fn(async () => null),
    },
    magicLink: {
      create: jest.fn(async () => ({ id: "ml1" })),
      findUnique: jest.fn(async () => null),
      update: jest.fn(async () => ({})),
    },
    passwordReset: {
      create: jest.fn(async () => ({ id: "pr1" })),
      findUnique: jest.fn(async () => null),
      update: jest.fn(async () => ({})),
    },
    mobileVerification: {
      create: jest.fn(async () => ({ id: "mv1" })),
      findUnique: jest.fn(async () => null),
      findFirst: jest.fn(async () => null),
      count: jest.fn(async () => 0),
      update: jest.fn(async () => ({})),
    },
    $transaction: jest.fn(async (arg: any) =>
      typeof arg === "function" ? arg(prisma) : Promise.all(arg),
    ),
  };
  const sessions = {
    create: jest.fn(async () => ({ token: "sess-token", expiresAt: new Date(Date.now() + 3_600_000) })),
    setTenant: jest.fn(),
    revokeAllForUser: jest.fn(),
  } as any;
  const config = {
    get: jest.fn((k: string, fb?: string) =>
      k === "AUTH_APP_URL"
        ? "https://auth.test"
        : // exercise the real OTP-send path (the SMS-send assertions) under test
          k === "DEV_SEND_OTP_SMS"
          ? true
          : (fb ?? ""),
    ),
  } as any;
  const dispatcher = { sendEmail: jest.fn(), sendSms: jest.fn() } as any;
  const logger = { debug: jest.fn(), error: jest.fn(), warn: jest.fn(), log: jest.fn() } as any;
  const outbox = { append: jest.fn() } as any;
  const planLimits = {
    assertTeamSeatAvailable: jest.fn(async () => undefined),
    assertCanAddTeamMember: jest.fn(async () => undefined),
  } as any;
  const svc = new IamFlowsService(prisma, sessions, config, dispatcher, logger, outbox, planLimits);
  return { svc, prisma, sessions, dispatcher, outbox, planLimits };
}

describe("IamFlowsService", () => {
  describe("magic link", () => {
    it("emails a link when the account exists", async () => {
      const { svc, prisma, dispatcher } = setup();
      prisma.user.findUnique.mockResolvedValueOnce({ id: "u1", email: "a@b.c" });
      const res = await svc.requestMagicLink("A@B.c");
      expect(res).toEqual({ ok: true });
      expect(prisma.magicLink.create).toHaveBeenCalled();
      const email = dispatcher.sendEmail.mock.calls[0][0];
      expect(email.templateKey).toBe("magic_link");
      expect(email.vars.link).toContain("https://auth.test/sign-in/magic-link?token=");
    });

    it("does NOT leak account existence for an unknown email", async () => {
      const { svc, prisma, dispatcher } = setup();
      prisma.user.findUnique.mockResolvedValueOnce(null);
      const res = await svc.requestMagicLink("nobody@x.y");
      expect(res).toEqual({ ok: true });
      expect(prisma.magicLink.create).not.toHaveBeenCalled();
      expect(dispatcher.sendEmail).not.toHaveBeenCalled();
    });

    it("consume marks single-use and grants a session", async () => {
      const { svc, prisma, sessions } = setup();
      prisma.magicLink.findUnique.mockResolvedValueOnce({
        id: "ml1",
        userId: "u1",
        consumedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
      const grant = await svc.consumeMagicLink("tok");
      expect(prisma.magicLink.update).toHaveBeenCalledWith({ where: { id: "ml1" }, data: { consumedAt: expect.any(Date) } });
      expect(sessions.create).toHaveBeenCalledWith("u1", { tenantId: "t1" });
      expect(grant.token).toBe("sess-token");
      expect(grant.memberships).toHaveLength(1);
    });

    it("consume rejects an expired link", async () => {
      const { svc, prisma } = setup();
      prisma.magicLink.findUnique.mockResolvedValueOnce({
        id: "ml1", userId: "u1", consumedAt: null, expiresAt: new Date(Date.now() - 1),
      });
      await expect(svc.consumeMagicLink("tok")).rejects.toThrow();
    });

    it("consume rejects an already-consumed link", async () => {
      const { svc, prisma } = setup();
      prisma.magicLink.findUnique.mockResolvedValueOnce({
        id: "ml1", userId: "u1", consumedAt: new Date(), expiresAt: new Date(Date.now() + 60_000),
      });
      await expect(svc.consumeMagicLink("tok")).rejects.toThrow();
    });
  });

  describe("password reset", () => {
    it("resets, consumes the token, and revokes all sessions", async () => {
      const { svc, prisma, sessions } = setup();
      prisma.passwordReset.findUnique.mockResolvedValueOnce({
        id: "pr1", userId: "u1", consumedAt: null, expiresAt: new Date(Date.now() + 60_000),
      });
      await svc.resetPassword("tok", "longenoughpw");
      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { passwordHash: expect.any(String) } });
      expect(prisma.passwordReset.update).toHaveBeenCalledWith({ where: { id: "pr1" }, data: { consumedAt: expect.any(Date) } });
      expect(sessions.revokeAllForUser).toHaveBeenCalledWith("u1");
    });

    it("rejects a short password", async () => {
      const { svc } = setup();
      await expect(svc.resetPassword("tok", "short")).rejects.toThrow();
    });

    it("rejects an invalid/expired reset token", async () => {
      const { svc, prisma } = setup();
      prisma.passwordReset.findUnique.mockResolvedValueOnce(null);
      await expect(svc.resetPassword("tok", "longenoughpw")).rejects.toThrow();
    });

    it("verifyResetToken reports validity without consuming", async () => {
      const { svc, prisma } = setup();
      prisma.passwordReset.findUnique.mockResolvedValueOnce({
        id: "pr1", userId: "u1", consumedAt: null, expiresAt: new Date(Date.now() + 60_000),
      });
      await expect(svc.verifyResetToken("tok")).resolves.toEqual({ valid: true });
      prisma.passwordReset.findUnique.mockResolvedValueOnce({
        id: "pr1", userId: "u1", consumedAt: new Date(), expiresAt: new Date(Date.now() + 60_000),
      });
      await expect(svc.verifyResetToken("tok")).resolves.toEqual({ valid: false });
    });
  });

  describe("email verification", () => {
    it("confirm marks the code used and flips emailVerified", async () => {
      const { svc, prisma } = setup();
      prisma.user.findUnique.mockResolvedValueOnce({ id: "u1", email: "a@b.c", emailVerified: false });
      prisma.mobileVerification.findFirst.mockResolvedValueOnce({ id: "mv1", userId: "u1" });
      await svc.confirmEmailVerification("a@b.c", "123456");
      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { emailVerified: true } });
    });

    it("confirm rejects a bad code", async () => {
      const { svc, prisma } = setup();
      prisma.user.findUnique.mockResolvedValueOnce({ id: "u1", email: "a@b.c", emailVerified: false });
      prisma.mobileVerification.findFirst.mockResolvedValueOnce(null);
      await expect(svc.confirmEmailVerification("a@b.c", "000000")).rejects.toThrow();
    });
  });

  describe("2FA", () => {
    it("start sends an SMS code and returns the challenge id", async () => {
      const { svc, prisma, dispatcher } = setup();
      prisma.user.findUnique.mockResolvedValueOnce({ id: "u1", mobile: "+61400000000" });
      const { challengeId } = await svc.start2fa("u1");
      expect(challengeId).toBe("mv1");
      expect(dispatcher.sendSms).toHaveBeenCalledWith(expect.objectContaining({ purpose: "2fa", toPhone: "+61400000000" }));
    });

    it("start throws without a mobile on file", async () => {
      const { svc, prisma } = setup();
      prisma.user.findUnique.mockResolvedValueOnce({ id: "u1", mobile: null });
      await expect(svc.start2fa("u1")).rejects.toThrow();
    });

    it("verify grants a session on a correct code", async () => {
      const { svc, prisma, sessions } = setup();
      prisma.mobileVerification.findUnique.mockResolvedValueOnce({
        id: "mv1", userId: "u1", code: "123456", verifiedAt: null, expiresAt: new Date(Date.now() + 60_000),
      });
      const grant = await svc.verify2fa("mv1", "123456");
      expect(grant.token).toBe("sess-token");
      expect(sessions.create).toHaveBeenCalledWith("u1", { tenantId: "t1" });
    });

    it("verify rejects a wrong code and increments attempts", async () => {
      const { svc, prisma } = setup();
      prisma.mobileVerification.findUnique.mockResolvedValueOnce({
        id: "mv1", userId: "u1", code: "123456", attempts: 0, verifiedAt: null, expiresAt: new Date(Date.now() + 60_000),
      });
      await expect(svc.verify2fa("mv1", "999999")).rejects.toThrow();
      expect(prisma.mobileVerification.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { attempts: { increment: 1 } } }),
      );
    });

    it("verify rejects once the attempt cap is reached", async () => {
      const { svc, prisma } = setup();
      prisma.mobileVerification.findUnique.mockResolvedValueOnce({
        id: "mv1", userId: "u1", code: "123456", attempts: 5, verifiedAt: null, expiresAt: new Date(Date.now() + 60_000),
      });
      await expect(svc.verify2fa("mv1", "123456")).rejects.toThrow();
    });

    it("start skips the SMS once over the per-user send cap", async () => {
      const { svc, prisma, dispatcher } = setup();
      prisma.user.findUnique.mockResolvedValueOnce({ id: "u1", mobile: "+61400000000" });
      prisma.mobileVerification.count.mockResolvedValueOnce(3); // at the cap
      await svc.start2fa("u1");
      expect(dispatcher.sendSms).not.toHaveBeenCalled();
    });
  });

  describe("phone-first login", () => {
    it("start sends an SMS code to a known, active number", async () => {
      const { svc, prisma, dispatcher } = setup();
      prisma.user.findUnique.mockResolvedValueOnce({ id: "u1", mobile: "+61400000000", deletedAt: null });
      const { challengeId } = await svc.startPhoneLogin("+61400000000");
      expect(challengeId).toBe("mv1");
      expect(prisma.mobileVerification.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: "u1", mobile: "+61400000000" }) }),
      );
      expect(dispatcher.sendSms).toHaveBeenCalledWith(
        expect.objectContaining({ purpose: "phone_login", toPhone: "+61400000000" }),
      );
    });

    it("start returns a challengeId but sends NO SMS for an unknown number (enumeration-safe)", async () => {
      const { svc, prisma, dispatcher } = setup();
      prisma.user.findUnique.mockResolvedValueOnce(null);
      const { challengeId } = await svc.startPhoneLogin("+61400000001");
      expect(challengeId).toBe("mv1");
      expect(prisma.mobileVerification.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: null, mobile: "+61400000001" }) }),
      );
      expect(dispatcher.sendSms).not.toHaveBeenCalled();
    });

    it("start skips the SMS once over the per-phone send cap (SMS-bomb guard)", async () => {
      const { svc, prisma, dispatcher } = setup();
      prisma.user.findUnique.mockResolvedValueOnce({ id: "u1", mobile: "+61400000000", deletedAt: null });
      prisma.mobileVerification.count.mockResolvedValueOnce(3); // at the cap
      await svc.startPhoneLogin("+61400000000");
      expect(dispatcher.sendSms).not.toHaveBeenCalled();
    });

    it("start rejects a non-E.164 number", async () => {
      const { svc } = setup();
      await expect(svc.startPhoneLogin("0400 000 000")).rejects.toThrow();
    });

    it("verify grants a session on a correct code", async () => {
      const { svc, prisma, sessions } = setup();
      prisma.mobileVerification.findUnique.mockResolvedValueOnce({
        id: "mv1", userId: "u1", mobile: "+61400000000", code: "123456", attempts: 0,
        verifiedAt: null, expiresAt: new Date(Date.now() + 60_000),
      });
      prisma.user.findUnique.mockResolvedValueOnce({ id: "u1", deletedAt: null, isSuperAdmin: false });
      const grant = await svc.verifyPhoneLogin("mv1", "123456");
      expect(grant.token).toBe("sess-token");
      expect(sessions.create).toHaveBeenCalledWith("u1", { tenantId: "t1" });
    });

    it("verify increments attempts and throws on a wrong code", async () => {
      const { svc, prisma } = setup();
      prisma.mobileVerification.findUnique.mockResolvedValueOnce({
        id: "mv1", userId: "u1", mobile: "+61400000000", code: "123456", attempts: 0,
        verifiedAt: null, expiresAt: new Date(Date.now() + 60_000),
      });
      await expect(svc.verifyPhoneLogin("mv1", "999999")).rejects.toThrow();
      expect(prisma.mobileVerification.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { attempts: { increment: 1 } } }),
      );
    });

    it("verify rejects once the attempt cap is reached", async () => {
      const { svc, prisma } = setup();
      prisma.mobileVerification.findUnique.mockResolvedValueOnce({
        id: "mv1", userId: "u1", mobile: "+61400000000", code: "123456", attempts: 5,
        verifiedAt: null, expiresAt: new Date(Date.now() + 60_000),
      });
      await expect(svc.verifyPhoneLogin("mv1", "123456")).rejects.toThrow();
    });

    it("verify rejects a decoy challenge (no user attached)", async () => {
      const { svc, prisma } = setup();
      prisma.mobileVerification.findUnique.mockResolvedValueOnce({
        id: "mv1", userId: null, mobile: "+61400000001", code: "123456", attempts: 0,
        verifiedAt: null, expiresAt: new Date(Date.now() + 60_000),
      });
      await expect(svc.verifyPhoneLogin("mv1", "123456")).rejects.toThrow();
    });

    it("verify refuses a session for a verified phone with no membership (awaiting approval)", async () => {
      const { svc, prisma, sessions } = setup();
      prisma.mobileVerification.findUnique.mockResolvedValueOnce({
        id: "mv1", userId: "u1", mobile: "+61400000000", code: "123456", attempts: 0,
        verifiedAt: null, expiresAt: new Date(Date.now() + 60_000),
      });
      prisma.user.findUnique.mockResolvedValueOnce({ id: "u1", deletedAt: null, isSuperAdmin: false });
      prisma.tenantMember.findMany.mockResolvedValueOnce([]); // no membership
      prisma.tenantJoinRequest.findFirst.mockResolvedValueOnce({ id: "jr1", status: "pending" });
      await expect(svc.verifyPhoneLogin("mv1", "123456")).rejects.toThrow();
      expect(sessions.create).not.toHaveBeenCalled();
    });
  });

  describe("2FA enrolment + mobile capture", () => {
    it("setMobile rejects a non-E.164 number", async () => {
      const { svc } = setup();
      await expect(svc.setMobile("u1", "0400 000 000")).rejects.toThrow();
    });

    it("enable2fa requires a verified mobile", async () => {
      const { svc, prisma } = setup();
      prisma.user.findUnique.mockResolvedValueOnce({ id: "u1", mobileVerified: false });
      await expect(svc.enable2fa("u1")).rejects.toThrow();
    });

    it("enable2fa flips twofaEnabled when the mobile is verified", async () => {
      const { svc, prisma } = setup();
      prisma.user.findUnique.mockResolvedValueOnce({ id: "u1", mobileVerified: true });
      prisma.user.update = jest.fn(async () => ({}));
      await svc.enable2fa("u1");
      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { twofaEnabled: true } });
    });
  });

  describe("change password", () => {
    it("verifies the current password, sets the new one, and revokes other sessions", async () => {
      const { svc, prisma, sessions, outbox } = setup();
      prisma.user.findUnique.mockResolvedValueOnce({
        id: "u1",
        passwordHash: await hashPassword("currentpw1"),
      });
      await svc.changePassword("u1", "currentpw1", "newlongpw1");
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "u1" },
        data: { passwordHash: expect.any(String) },
      });
      expect(sessions.revokeAllForUser).toHaveBeenCalledWith("u1");
      expect(outbox.append).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ eventType: "iam.user.password-reset" }),
      );
    });

    it("rejects a wrong current password", async () => {
      const { svc, prisma } = setup();
      prisma.user.findUnique.mockResolvedValueOnce({
        id: "u1",
        passwordHash: await hashPassword("currentpw1"),
      });
      await expect(svc.changePassword("u1", "wrongpw", "newlongpw1")).rejects.toThrow();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("rejects a too-short new password", async () => {
      const { svc, prisma } = setup();
      prisma.user.findUnique.mockResolvedValueOnce({
        id: "u1",
        passwordHash: await hashPassword("currentpw1"),
      });
      await expect(svc.changePassword("u1", "currentpw1", "short")).rejects.toThrow();
    });
  });

  describe("change email", () => {
    it("verifies the password, sets the email unverified, and sends a verification", async () => {
      const { svc, prisma, dispatcher, outbox } = setup();
      const passwordHash = await hashPassword("currentpw1");
      prisma.user.findUnique
        .mockResolvedValueOnce({ id: "u1", email: "old@x.y", passwordHash }) // password check
        .mockResolvedValueOnce(null) // email-taken check
        .mockResolvedValueOnce({ id: "u1", email: "new@x.y", emailVerified: false }); // sendEmailVerification
      await svc.changeEmail("u1", "New@X.Y", "currentpw1");
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "u1" },
        data: { email: "new@x.y", emailVerified: false },
      });
      expect(outbox.append).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ eventType: "iam.user.email-changed" }),
      );
      expect(dispatcher.sendEmail).toHaveBeenCalled();
    });

    it("rejects a wrong password", async () => {
      const { svc, prisma } = setup();
      prisma.user.findUnique.mockResolvedValueOnce({
        id: "u1",
        email: "old@x.y",
        passwordHash: await hashPassword("currentpw1"),
      });
      await expect(svc.changeEmail("u1", "new@x.y", "wrongpw")).rejects.toThrow();
    });

    it("rejects an email already in use", async () => {
      const { svc, prisma } = setup();
      prisma.user.findUnique
        .mockResolvedValueOnce({ id: "u1", email: "old@x.y", passwordHash: await hashPassword("currentpw1") })
        .mockResolvedValueOnce({ id: "u2", email: "new@x.y" }); // taken
      await expect(svc.changeEmail("u1", "new@x.y", "currentpw1")).rejects.toThrow();
    });
  });

  describe("delete account", () => {
    it("soft-deletes, removes memberships, revokes sessions and emits the event", async () => {
      const { svc, prisma, sessions, outbox } = setup();
      prisma.user.findUnique.mockResolvedValueOnce({
        id: "u1",
        deletedAt: null,
        passwordHash: await hashPassword("currentpw1"),
      });
      prisma.tenantMember.findMany.mockResolvedValueOnce([{ tenantId: "t1", role: "VOLUNTEER" }]);
      await svc.deleteAccount("u1", "currentpw1");
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "u1" },
        data: { deletedAt: expect.any(Date) },
      });
      expect(prisma.tenantMember.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
      expect(sessions.revokeAllForUser).toHaveBeenCalledWith("u1");
      expect(outbox.append).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ eventType: "iam.user.deleted" }),
      );
    });

    it("rejects a wrong password", async () => {
      const { svc, prisma } = setup();
      prisma.user.findUnique.mockResolvedValueOnce({
        id: "u1",
        deletedAt: null,
        passwordHash: await hashPassword("currentpw1"),
      });
      await expect(svc.deleteAccount("u1", "wrongpw")).rejects.toThrow();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("blocks the sole organiser of a tenant", async () => {
      const { svc, prisma } = setup();
      prisma.user.findUnique.mockResolvedValueOnce({
        id: "u1",
        deletedAt: null,
        passwordHash: await hashPassword("currentpw1"),
      });
      prisma.tenantMember.findMany.mockResolvedValueOnce([{ tenantId: "t1", role: "ORGANISER" }]);
      prisma.tenantMember.count.mockResolvedValueOnce(1); // sole organiser
      await expect(svc.deleteAccount("u1", "currentpw1")).rejects.toThrow();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe("join requests (self-signup → approval)", () => {
    it("requestAccess creates a new user (unverified) + an unverified request, sends a code, no session", async () => {
      const { svc, prisma, sessions, dispatcher } = setup();
      // 1st lookup (new-user check in the tx) → null; later lookup (sendEmailVerification) → the created user.
      prisma.user.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValue({ id: "newuser", email: "new@x.y", emailVerified: false });
      const res = await svc.requestAccess({
        email: "New@X.Y", password: "longenoughpw", displayName: "New U",
        requestedRole: "volunteer", tenantSlug: "org-one",
      });
      expect(res).toEqual({ ok: true });
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ emailVerified: false, email: "new@x.y" }) }),
      );
      expect(prisma.tenantJoinRequest.create).toHaveBeenCalled();
      expect(prisma.tenantJoinRequest.create.mock.calls[0][0].data.status).toBe("unverified");
      expect(sessions.create).not.toHaveBeenCalled();
      // sends a verification code (sendEmailVerification → mobileVerification.create + dispatcher)
      expect(dispatcher.sendEmail).toHaveBeenCalled();
    });

    it("requestAccess short-circuits when the user is already a member (no request, no code)", async () => {
      const { svc, prisma, dispatcher } = setup();
      prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.c" });
      prisma.tenantMember.findUnique.mockResolvedValue({ tenantId: "t1", userId: "u1", role: "VOLUNTEER" });
      const res = await svc.requestAccess({
        email: "a@b.c", password: "longenoughpw", displayName: "A", requestedRole: "staff", tenantSlug: "org-one",
      });
      expect(res).toEqual({ ok: true, alreadyMember: true });
      expect(prisma.tenantJoinRequest.upsert).not.toHaveBeenCalled();
      expect(dispatcher.sendEmail).not.toHaveBeenCalled();
    });

    it("requestAccess re-request after rejection resets the row to unverified", async () => {
      const { svc, prisma } = setup();
      prisma.user.findUnique
        .mockResolvedValueOnce({ id: "u1", email: "a@b.c" }) // existing user
        .mockResolvedValue({ id: "u1", email: "a@b.c", emailVerified: false });
      prisma.tenantMember.findUnique.mockResolvedValueOnce(null); // not a member
      prisma.tenantJoinRequest.findUnique.mockResolvedValueOnce({ id: "jr1", status: "rejected" });
      await svc.requestAccess({ email: "a@b.c", password: "longenoughpw", displayName: "A", requestedRole: "staff", tenantSlug: "org-one" });
      expect(prisma.tenantJoinRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "unverified", decidedBy: null, decidedAt: null }) }),
      );
    });

    it("requestAccess on an existing PENDING row preserves status/audit (only refreshes the hint)", async () => {
      const { svc, prisma } = setup();
      prisma.user.findUnique
        .mockResolvedValueOnce({ id: "u1", email: "a@b.c" })
        .mockResolvedValue({ id: "u1", email: "a@b.c", emailVerified: false });
      prisma.tenantMember.findUnique.mockResolvedValueOnce(null);
      prisma.tenantJoinRequest.findUnique.mockResolvedValueOnce({ id: "jr1", status: "pending" });
      await svc.requestAccess({ email: "a@b.c", password: "longenoughpw", displayName: "A", requestedRole: "volunteer", tenantSlug: "org-one" });
      const arg = prisma.tenantJoinRequest.update.mock.calls[0][0];
      expect(arg.data).toEqual({ requestedRole: "volunteer" }); // no status/decidedBy reset
    });

    it("requestAccess rejects an unknown organisation slug", async () => {
      const { svc, prisma } = setup();
      prisma.tenant.findFirst.mockResolvedValueOnce(null);
      await expect(
        svc.requestAccess({ email: "a@b.c", password: "longenoughpw", displayName: "A", requestedRole: "staff", tenantSlug: "nope" }),
      ).rejects.toThrow();
    });

    it("confirmAccess promotes unverified → pending and emits submitted", async () => {
      const { svc, prisma, outbox } = setup();
      // confirmEmailVerification path
      prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.c", emailVerified: false });
      prisma.mobileVerification.findFirst.mockResolvedValueOnce({ id: "mv1", userId: "u1" });
      prisma.tenantJoinRequest.updateMany.mockResolvedValueOnce({ count: 1 });
      prisma.tenantJoinRequest.findUnique.mockResolvedValue({ id: "jr1", requestedRole: "volunteer" });
      await svc.confirmAccess("a@b.c", "123456", "org-one");
      expect(outbox.append).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ eventType: "tenant.join-request.submitted" }),
      );
    });

    it("approveJoinRequest creates the membership (shared core) + emits member.added & approved", async () => {
      const { svc, prisma, outbox } = setup();
      prisma.tenantJoinRequest.findFirst.mockResolvedValueOnce({ id: "jr1", tenantId: "t1", userId: "u1", status: "pending" });
      prisma.tenantJoinRequest.updateMany.mockResolvedValueOnce({ count: 1 }); // wins the race
      await svc.approveJoinRequest("t1", "jr1", { role: "VOLUNTEER" as any, approvedBy: "admin1" });
      expect(prisma.tenantMember.upsert).toHaveBeenCalled();
      const types = outbox.append.mock.calls.map((c: any) => c[1].eventType);
      expect(types).toContain("tenant.member.added");
      expect(types).toContain("tenant.join-request.approved");
    });

    it("approveJoinRequest is a no-op on an already-approved request", async () => {
      const { svc, prisma, outbox } = setup();
      prisma.tenantJoinRequest.findFirst.mockResolvedValueOnce({ id: "jr1", tenantId: "t1", userId: "u1", status: "approved" });
      await svc.approveJoinRequest("t1", "jr1", { role: "VOLUNTEER" as any });
      expect(prisma.tenantMember.upsert).not.toHaveBeenCalled();
      expect(outbox.append).not.toHaveBeenCalled();
    });

    it("approveJoinRequest emits nothing if it loses the race (conditional update count 0)", async () => {
      const { svc, prisma, outbox } = setup();
      prisma.tenantJoinRequest.findFirst.mockResolvedValueOnce({ id: "jr1", tenantId: "t1", userId: "u1", status: "pending" });
      prisma.tenantJoinRequest.updateMany.mockResolvedValueOnce({ count: 0 }); // lost the race
      await svc.approveJoinRequest("t1", "jr1", { role: "VOLUNTEER" as any });
      expect(prisma.tenantMember.upsert).not.toHaveBeenCalled();
      expect(outbox.append).not.toHaveBeenCalled();
    });

    it("approveJoinRequest rejects approving a rejected request", async () => {
      const { svc, prisma } = setup();
      prisma.tenantJoinRequest.findFirst.mockResolvedValueOnce({ id: "jr1", tenantId: "t1", userId: "u1", status: "rejected" });
      await expect(svc.approveJoinRequest("t1", "jr1", { role: "VOLUNTEER" as any })).rejects.toThrow();
    });

    it("rejectJoinRequest moves pending → rejected and emits rejected", async () => {
      const { svc, prisma, outbox } = setup();
      prisma.tenantJoinRequest.findFirst.mockResolvedValueOnce({ id: "jr1", tenantId: "t1", userId: "u1", status: "pending" });
      prisma.tenantJoinRequest.updateMany.mockResolvedValueOnce({ count: 1 });
      await svc.rejectJoinRequest("t1", "jr1", { rejectedBy: "admin1" });
      expect(outbox.append).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ eventType: "tenant.join-request.rejected" }),
      );
    });

    it("rejectJoinRequest refuses to reject an approved request", async () => {
      const { svc, prisma } = setup();
      prisma.tenantJoinRequest.findFirst.mockResolvedValueOnce({ id: "jr1", tenantId: "t1", userId: "u1", status: "approved" });
      await expect(svc.rejectJoinRequest("t1", "jr1")).rejects.toThrow();
    });

    it("requestAccessByPhone creates a phone user + unverified request, texts a code, no session", async () => {
      const { svc, prisma, sessions, dispatcher } = setup();
      prisma.user.findUnique
        .mockResolvedValueOnce(null) // by-mobile lookup in the tx
        .mockResolvedValue({ id: "newuser", mobile: "+61400000000" }); // sendMobileVerification → start2fa
      const res = await svc.requestAccessByPhone({
        phone: "+61400000000",
        displayName: "Vol U",
        requestedRole: "volunteer",
        tenantSlug: "org-one",
      });
      expect(res).toEqual({ ok: true });
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ mobile: "+61400000000", mobileVerified: false }) }),
      );
      const reqData = prisma.tenantJoinRequest.create.mock.calls[0][0].data;
      expect(reqData.status).toBe("unverified");
      expect(reqData.phone).toBe("+61400000000");
      expect(sessions.create).not.toHaveBeenCalled();
      expect(dispatcher.sendSms).toHaveBeenCalled();
    });

    it("requestAccessByPhone rejects a non-E.164 number", async () => {
      const { svc } = setup();
      await expect(
        svc.requestAccessByPhone({ phone: "0400000000", displayName: "X", requestedRole: "volunteer", tenantSlug: "org-one" }),
      ).rejects.toThrow();
    });

    it("confirmAccessByPhone verifies the code, promotes to pending and emits submitted", async () => {
      const { svc, prisma, outbox } = setup();
      prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "61400000000@phone.uprise.invalid", mobile: "+61400000000" });
      prisma.mobileVerification.findFirst.mockResolvedValueOnce({ id: "mv1", userId: "u1" });
      prisma.tenantJoinRequest.updateMany.mockResolvedValueOnce({ count: 1 });
      prisma.tenantJoinRequest.findUnique.mockResolvedValue({ id: "jr1", requestedRole: "volunteer" });
      await svc.confirmAccessByPhone("+61400000000", "123456", "org-one");
      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { mobileVerified: true } });
      expect(outbox.append).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ eventType: "tenant.join-request.submitted" }),
      );
    });

    it("signIn returns 'pending' for a verified user with no membership but an open request", async () => {
      const { svc, prisma } = setup();
      prisma.user.findUnique.mockResolvedValueOnce({ id: "u1", email: "a@b.c", passwordHash: await hashPassword("longenoughpw"), deletedAt: null });
      prisma.tenantMember.findMany.mockResolvedValueOnce([]); // no membership
      prisma.tenantJoinRequest.findFirst.mockResolvedValueOnce({ id: "jr1", status: "pending" });
      expect(await svc.signIn("a@b.c", "longenoughpw")).toEqual({ kind: "pending" });
    });
  });

  describe("invitation", () => {
    const validInvite = {
      id: "inv1", tenantId: "t1", email: "new@x.y", role: "ORGANISER", status: "pending",
      token: "tok", expiresAt: new Date(Date.now() + 86_400_000), invitedBy: "owner",
    };

    it("accept creates a new user + membership and marks the invite accepted", async () => {
      const { svc, prisma, sessions } = setup();
      prisma.tenantInvitation.findUnique.mockResolvedValue(validInvite);
      prisma.user.findUnique.mockResolvedValue(null); // new user
      const grant = await svc.acceptInvite("tok", { displayName: "New U", password: "longenoughpw" });
      expect(prisma.user.create).toHaveBeenCalled();
      expect(prisma.tenantMember.upsert).toHaveBeenCalled();
      expect(prisma.tenantInvitation.update).toHaveBeenCalledWith({ where: { id: "inv1" }, data: { status: "accepted" } });
      expect(grant.token).toBe("sess-token");
      expect(sessions.create).toHaveBeenCalled();
    });

    it("accept attaches an existing user without requiring a password", async () => {
      const { svc, prisma } = setup();
      prisma.tenantInvitation.findUnique.mockResolvedValue(validInvite);
      prisma.user.findUnique.mockResolvedValue({ id: "existing", email: "new@x.y" });
      await svc.acceptInvite("tok", {});
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.tenantMember.upsert).toHaveBeenCalled();
    });

    it("accept rejects a new user with no password", async () => {
      const { svc, prisma } = setup();
      prisma.tenantInvitation.findUnique.mockResolvedValue(validInvite);
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(svc.acceptInvite("tok", {})).rejects.toThrow();
    });

    it("accept on a PHONE invite creates a passwordless, mobile-verified user", async () => {
      const { svc, prisma } = setup();
      prisma.tenantInvitation.findUnique.mockResolvedValue({
        ...validInvite,
        email: null,
        phone: "+61400000000",
        role: "VOLUNTEER",
      });
      prisma.user.findUnique.mockResolvedValue(null); // new user by mobile
      await svc.acceptInvite("tok", { displayName: "Vol U" });
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ mobile: "+61400000000", mobileVerified: true }) }),
      );
      expect(prisma.tenantMember.upsert).toHaveBeenCalled();
    });

    it("rejects an expired or non-pending invitation", async () => {
      const { svc, prisma } = setup();
      prisma.tenantInvitation.findUnique.mockResolvedValue({ ...validInvite, status: "accepted" });
      await expect(svc.previewInvite("tok")).rejects.toThrow();
    });
  });

  describe("open campaign join (tokenless)", () => {
    const openCampaign = { id: "c1", name: "Spring Doorknock", tenantId: "t1", openJoinEnabled: true, status: "ACTIVE" };
    const challenge = {
      id: "mv1", mobile: "+61400000001", code: "123456", attempts: 0,
      verifiedAt: null, expiresAt: new Date(Date.now() + 600_000),
    };

    it("start sends an OTP for an open, active campaign", async () => {
      const { svc, prisma, dispatcher } = setup();
      prisma.canvassCampaign.findUnique.mockResolvedValue(openCampaign);
      const res = await svc.openJoinStartPhone("c1", "+61400000001");
      expect(res.challengeId).toBe("mv1");
      expect(prisma.mobileVerification.create).toHaveBeenCalled();
      expect(dispatcher.sendSms).toHaveBeenCalled();
    });

    it("rejects start when open-join is off", async () => {
      const { svc, prisma, dispatcher } = setup();
      prisma.canvassCampaign.findUnique.mockResolvedValue({ ...openCampaign, openJoinEnabled: false });
      await expect(svc.openJoinStartPhone("c1", "0400000001")).rejects.toThrow();
      expect(dispatcher.sendSms).not.toHaveBeenCalled();
    });

    it("rejects start when the campaign isn't ACTIVE", async () => {
      const { svc, prisma } = setup();
      prisma.canvassCampaign.findUnique.mockResolvedValue({ ...openCampaign, status: "DRAFT" });
      await expect(svc.openJoinStartPhone("c1", "0400000001")).rejects.toThrow();
    });

    it("accept verifies the OTP, then creates a VOLUNTEER membership + session immediately (no approval)", async () => {
      const { svc, prisma, sessions } = setup();
      prisma.canvassCampaign.findUnique.mockResolvedValue(openCampaign);
      prisma.mobileVerification.findUnique.mockResolvedValue(challenge);
      prisma.user.findUnique.mockResolvedValue(null); // new user by mobile
      const grant = await svc.openJoinAccept("c1", { challengeId: "mv1", code: "123456", displayName: "Jo Vol" });
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ mobile: "+61400000001", mobileVerified: true, signupSource: "open_join" }),
        }),
      );
      expect(prisma.tenantMember.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ tenantId: "t1", role: "VOLUNTEER" }) }),
      );
      expect(prisma.tenantJoinRequest.create).not.toHaveBeenCalled(); // immediate, never pending
      expect(sessions.create).toHaveBeenCalled();
      expect(grant.token).toBe("sess-token");
    });

    it("rejects accept when open-join is off", async () => {
      const { svc, prisma } = setup();
      prisma.canvassCampaign.findUnique.mockResolvedValue({ ...openCampaign, openJoinEnabled: false });
      await expect(svc.openJoinAccept("c1", { challengeId: "mv1", code: "123456" })).rejects.toThrow();
    });

    it("rejects accept on a bad OTP code", async () => {
      const { svc, prisma } = setup();
      prisma.canvassCampaign.findUnique.mockResolvedValue(openCampaign);
      prisma.mobileVerification.findUnique.mockResolvedValue(challenge);
      await expect(svc.openJoinAccept("c1", { challengeId: "mv1", code: "000000" })).rejects.toThrow();
    });
  });

  describe("select tenant", () => {
    it("pins the tenant when the user is a member", async () => {
      const { svc, prisma, sessions } = setup();
      prisma.tenantMember.findUnique.mockResolvedValueOnce({ tenantId: "t2", userId: "u1", role: "VOLUNTEER" });
      await svc.selectTenant("u1", "sess", "t2");
      expect(sessions.setTenant).toHaveBeenCalledWith("sess", "t2");
    });

    it("rejects a tenant the user is not a member of", async () => {
      const { svc, prisma, sessions } = setup();
      prisma.tenantMember.findUnique.mockResolvedValueOnce(null);
      await expect(svc.selectTenant("u1", "sess", "t9")).rejects.toThrow();
      expect(sessions.setTenant).not.toHaveBeenCalled();
    });

    it("lets a super-admin pin an existing tenant they're not a member of", async () => {
      const { svc, prisma, sessions } = setup();
      prisma.tenantMember.findUnique.mockResolvedValueOnce(null);
      prisma.user.findUnique.mockResolvedValueOnce({ id: "u1", isSuperAdmin: true });
      prisma.tenant.findFirst.mockResolvedValueOnce({ id: "t9", name: "Other Org" });
      await svc.selectTenant("u1", "sess", "t9");
      expect(sessions.setTenant).toHaveBeenCalledWith("sess", "t9");
    });

    it("rejects a super-admin pinning an unknown tenant", async () => {
      const { svc, prisma, sessions } = setup();
      prisma.tenantMember.findUnique.mockResolvedValueOnce(null);
      prisma.user.findUnique.mockResolvedValueOnce({ id: "u1", isSuperAdmin: true });
      prisma.tenant.findFirst.mockResolvedValueOnce(null);
      await expect(svc.selectTenant("u1", "sess", "ghost")).rejects.toThrow();
      expect(sessions.setTenant).not.toHaveBeenCalled();
    });
  });

  describe("lifecycle events", () => {
    it("emits iam.user.signed-in when a session is granted", async () => {
      const { svc, prisma, outbox } = setup();
      prisma.magicLink.findUnique.mockResolvedValueOnce({
        id: "ml1",
        userId: "u1",
        consumedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
      await svc.consumeMagicLink("tok");
      expect(outbox.append).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ eventType: "iam.user.signed-in", payload: { userId: "u1", tenantId: "t1" } }),
      );
    });

    it("emits iam.user.password-reset on reset", async () => {
      const { svc, prisma, outbox } = setup();
      prisma.passwordReset.findUnique.mockResolvedValueOnce({
        id: "pr1",
        userId: "u1",
        consumedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
      await svc.resetPassword("tok", "longenoughpw");
      expect(outbox.append).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ eventType: "iam.user.password-reset" }),
      );
    });

    it("declineInvite marks the invite declined + emits the event", async () => {
      const { svc, prisma, outbox } = setup();
      prisma.tenantInvitation.findUnique.mockResolvedValueOnce({
        id: "inv1",
        tenantId: "t1",
        email: "x@y.z",
        role: "VOLUNTEER",
        status: "pending",
        expiresAt: new Date(Date.now() + 60_000),
      });
      await svc.declineInvite("tok");
      expect(prisma.tenantInvitation.update).toHaveBeenCalledWith({
        where: { id: "inv1" },
        data: { status: "declined" },
      });
      expect(outbox.append).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ eventType: "tenant.invitation.declined" }),
      );
    });

    it("signIn returns invalid for an unknown user", async () => {
      const { svc } = setup();
      expect(await svc.signIn("nobody@x.y", "pw")).toEqual({ kind: "invalid" });
    });
  });
});
