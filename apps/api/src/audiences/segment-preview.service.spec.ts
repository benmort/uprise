import {
  DEFAULT_SEGMENT_POLICY,
  orderByHash,
  type FilterNode,
  type SegmentPolicy,
} from "@uprise/segmentation";
import { maskEmail, maskPhone, SegmentPreviewService } from "./segment-preview.service";

const FILTER: FilterNode = {
  kind: "condition",
  condition: { type: "tag.tagged", op: "in", values: ["t"] },
};

function setup(opts: { matched: string[]; policyPass?: string[]; compliancePass?: string[] }) {
  const universe = new Set(["c1", "c2", "c3", "c4", "c5"]);
  const contacts = [...universe].map((id, i) => ({
    id,
    firstName: `F${i}`,
    lastName: `L${i}`,
    phoneE164: `+6140000000${i}`,
    email: `${id}@example.org`,
  }));
  const prisma: any = {
    contact: {
      findMany: jest.fn(async ({ where }: any) =>
        contacts.filter((c) => where.id.in.includes(c.id)),
      ),
    },
  };
  const leafResolver: any = {
    universe: jest.fn(async () => universe),
    resolveLeaves: jest.fn(async (_t: string, leaves: any[]) => {
      const resolved = new Map();
      for (const leaf of leaves) {
        if (leaf.kind === "mechanic") {
          resolved.set(leaf, new Set(opts.policyPass ?? [...universe]));
        } else if (leaf.condition.type.startsWith("compliance.")) {
          resolved.set(leaf, new Set(opts.compliancePass ?? [...universe]));
        } else if (leaf.layer === "policy") {
          resolved.set(leaf, new Set(opts.policyPass ?? [...universe]));
        } else {
          resolved.set(leaf, new Set(opts.matched));
        }
      }
      return { resolved, clauseErrors: [] };
    }),
  };
  return { svc: new SegmentPreviewService(prisma, leafResolver), universe };
}

describe("SegmentPreviewService", () => {
  it("counts satisfy the layer identities and the sample is the hash-order head", async () => {
    const policy: SegmentPolicy = {
      fatigue: { enabled: true, windowHours: 72, maxSends: 3 },
      isActive: { enabled: false, predicate: DEFAULT_SEGMENT_POLICY.isActive.predicate },
    };
    const { svc } = setup({
      matched: ["c1", "c2", "c3", "c4"],
      policyPass: ["c1", "c2", "c3"],
      compliancePass: ["c1", "c2"],
    });
    const preview = await svc.preview("t1", { filter: FILTER, policy, seed: "s1" });

    expect(preview.total).toBe(5);
    expect(preview.matched).toBe(4);
    expect(preview.shaped).toBe(3);
    expect(preview.sendable).toBe(2);
    expect(preview.excludedByPolicy).toBe(preview.matched - preview.shaped);
    expect(preview.excludedByCompliance).toBe(preview.shaped - preview.sendable);

    // preview == send: the sample order is exactly the deterministic hash head.
    const expected = orderByHash(["c1", "c2"], "s1");
    expect(preview.sample.map((s) => s.contactId)).toEqual(expected);
  });

  it("masks PII in the sample (no raw phone/email leaves the api)", async () => {
    const { svc } = setup({ matched: ["c1"], compliancePass: ["c1"] });
    const preview = await svc.preview("t1", { filter: FILTER, policy: DEFAULT_SEGMENT_POLICY });
    expect(preview.sample[0].maskedPhone).toMatch(/^\+61•+000$/);
    expect(preview.sample[0].maskedEmail).toBe("c•••@example.org");
    expect(JSON.stringify(preview)).not.toContain("+61400000000");
  });

  it("policy off ⇒ shaped == matched (no policy layer folded)", async () => {
    const { svc } = setup({ matched: ["c1", "c2"], compliancePass: ["c1", "c2", "c3"] });
    const preview = await svc.preview("t1", { filter: FILTER, policy: DEFAULT_SEGMENT_POLICY });
    expect(preview.shaped).toBe(preview.matched);
    expect(preview.excludedByPolicy).toBe(0);
  });
});

describe("masking helpers", () => {
  it("maskPhone keeps prefix + last three only", () => {
    expect(maskPhone("+61412345789")).toBe("+61••••••789");
    expect(maskPhone(null)).toBeNull();
    expect(maskPhone("12345")).toBe("•••••");
  });
  it("maskEmail keeps first char + domain", () => {
    expect(maskEmail("alex@example.org")).toBe("a•••@example.org");
    expect(maskEmail(null)).toBeNull();
    expect(maskEmail("junk")).toBe("•••");
  });
});
