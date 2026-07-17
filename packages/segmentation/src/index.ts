/**
 * @uprise/segmentation — the pure segmentation domain, ported from slingshot's
 * segmentation engine (+ the prototype's AI trust boundary), adapted to uprise's
 * audiences framework. No I/O, no Prisma — the api hosts the leaf resolvers.
 */

// definition — types
export * from "./definition/types/filter.types";
export * from "./definition/types/condition.types";
export * from "./definition/types/condition-layer";
export * from "./definition/types/segment-definition.types";

// definition — validation (the runtime authority)
export * from "./definition/validation/filter-bounds";
export * from "./definition/validation/condition.schema";
export * from "./definition/validation/filter.schema";
export * from "./definition/validation/segment-definition.schema";

// composition — the 3-layer effective tree
export * from "./composition/context-model";
export * from "./composition/effective-tree";
export * from "./composition/compose";

// evaluation — the pure fold + determinism
export * from "./evaluation/contact-set";
export * from "./evaluation/set-fold";
export * from "./evaluation/hash-order";
export * from "./evaluation/preview.types";

// catalogue — the attribute vocabulary
export * from "./catalogue/catalogue.types";
export * from "./catalogue/uprise-catalogue";
export * from "./catalogue/describe";
export * from "./catalogue/condition-support";

// ai — the trust boundary + deterministic fallback
export * from "./ai/normalise";
export * from "./ai/describe-tree";
export * from "./ai/keyword-matcher";

// api — the /segments contract types
export * from "./api/contracts";
