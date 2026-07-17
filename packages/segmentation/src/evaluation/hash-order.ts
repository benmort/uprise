/**
 * Deterministic-hash ordering (ported verbatim from slingshot SEG-0007 /
 * SEG-D-0005).
 *
 * Ordering is `hash(contactId, seed)` with a per-segment `seed` (random at
 * segment creation, whitespace-free). A good hash is a uniform, reproducible
 * pseudo-random function, so it gives — with **no stored random** (no snapshot):
 *
 * - **preview == send** — the same `(definition, seed)` yields the same order
 *   every call (the preview sample is the head of the eventual send order);
 * - **stable order** across re-materialisation — adding contacts never
 *   reshuffles earlier positions.
 *
 * The separator is a literal SPACE — slingshot's hard-won fix (their original
 * accidentally concatenated with an invisible NUL byte, silently diverging the
 * JS and SQL orders). Keep the seed whitespace-free so the concatenation stays
 * unambiguous.
 *
 * Implemented with the pure-JS `js-sha256` (not `node:crypto`) so the package
 * stays isomorphic — the admin builder imports this barrel in the browser. The
 * golden-vector spec locks the output bit-for-bit to the node-crypto values.
 */
import { sha256 } from "js-sha256";

/** SHA-256 hex of `"${seed} ${contactId}"` — the per-contact sort key. */
export const hashContact = (contactId: string, seed: string): string =>
  sha256(`${seed} ${contactId}`);

/**
 * Order contacts by ascending `hash(contactId, seed)`, tie-broken by id for
 * total determinism. The returned array is the deterministic draw order.
 */
export const orderByHash = (contactIds: Iterable<string>, seed: string): string[] =>
  [...contactIds]
    .map((id) => ({ id, hash: hashContact(id, seed) }))
    .sort((a, b) =>
      a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    )
    .map((entry) => entry.id);
