import { IamFlowsService } from "./iam-flows.service";

function setup() {
  const prisma: any = {
    user: {
      findUnique: jest.fn(async () => null),
      create: jest.fn(async ({ data }: any) => ({ id: "newuser", ...data })),
      update: jest.fn(async () => ({})),
    },
    tenant: {
      findUnique: jest.fn(async () => ({ id: "t1", name: "Org One" })),
      upsert: jest.fn(async () => ({ id: "t1", name: "Org One" })),
    },
    tenantMember: {
      findFirst: jest.fn(async () => ({ tenantId: "t1", role: "ORGANISER" })),
      findMany: jest.fn(async () => [{ tenantId: "t1", role: "ORGANISER", tenant: { name: "Org One" } }]),
      findUnique: jest.fn(async () => ({ tenantId: "t1", userId: "u1", role: "ORGANISER" })),
      upsert: jest.fn(async () => ({})),
    },
    tenantInvitation: {
      findUnique: jest.fn(async () => null),
      update: jest.fn(async () => ({})),
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
  const config = { get: jest.fn((k: string, fb?: string) => (k === "AUTH_APP_URL" ? "https://auth.test" : fb ?? "")) } as any;
  const dispatcher = { sendEmail: jest.fn(), sendSms: jest.fn() } as any;
  const logger = { debug: jest.fn(), error: jest.fn(), warn: jest.fn(), log: jest.fn() } as any;
  const outbox = { append: jest.fn() } as any;
  const svc = new IamFlowsService(prisma, sessions, config, dispatcher, logger, outbox);
  return { svc, prisma, sessions, dispatcher, outbox };
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

    it("verify rejects a wrong code", async () => {
      const { svc, prisma } = setup();
      prisma.mobileVerification.findUnique.mockResolvedValueOnce({
        id: "mv1", userId: "u1", code: "123456", verifiedAt: null, expiresAt: new Date(Date.now() + 60_000),
      });
      await expect(svc.verify2fa("mv1", "999999")).rejects.toThrow();
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

    it("rejects an expired or non-pending invitation", async () => {
      const { svc, prisma } = setup();
      prisma.tenantInvitation.findUnique.mockResolvedValue({ ...validInvite, status: "accepted" });
      await expect(svc.previewInvite("tok")).rejects.toThrow();
    });
  });

  describe("select tenant", () => {
    it("pins the tenant when the user is a member", async () => {
      const { svc, prisma, sessions } = setup();
      prisma.tenantMember.findUnique.mockResolvedValueOnce({ tenantId: "t2", userId: "u1", role: "CANVASSER" });
      await svc.selectTenant("u1", "sess", "t2");
      expect(sessions.setTenant).toHaveBeenCalledWith("sess", "t2");
    });

    it("rejects a tenant the user is not a member of", async () => {
      const { svc, prisma, sessions } = setup();
      prisma.tenantMember.findUnique.mockResolvedValueOnce(null);
      await expect(svc.selectTenant("u1", "sess", "t9")).rejects.toThrow();
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
        role: "CANVASSER",
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
