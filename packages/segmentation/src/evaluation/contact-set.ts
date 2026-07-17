/**
 * Set-algebra primitives over `contactId` sets (ported verbatim from slingshot
 * SEG-0007).
 *
 * The evaluator resolves each effective-tree leaf to a set of `contactId`s and
 * folds the tree with these three operations (`all`→∩, `any`→∪, `none`→∖). They
 * are deliberately tiny, allocation-light, and pure.
 *
 * Iteration cost is kept low by always walking the smaller operand for an
 * intersection. No `contactId` is ever interpreted — these operate on opaque
 * ids only (PII never enters segmentation).
 */

/** `a ∩ b` — contacts in both sets. Walks the smaller operand. */
export const intersect = (a: ReadonlySet<string>, b: ReadonlySet<string>): Set<string> => {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  const out = new Set<string>();
  for (const id of small) if (large.has(id)) out.add(id);
  return out;
};

/** `a ∪ b` — contacts in either set. */
export const union = (a: ReadonlySet<string>, b: ReadonlySet<string>): Set<string> => {
  const out = new Set<string>(a);
  for (const id of b) out.add(id);
  return out;
};

/** `a ∖ b` — contacts in `a` but not `b`. */
export const difference = (a: ReadonlySet<string>, b: ReadonlySet<string>): Set<string> => {
  const out = new Set<string>();
  for (const id of a) if (!b.has(id)) out.add(id);
  return out;
};

/**
 * `∩` of every set, bounded by `universe`. An empty list is the unconstrained
 * set (`universe`) — an `all()` group with no children imposes no constraint.
 */
export const intersectAll = (
  sets: readonly ReadonlySet<string>[],
  universe: ReadonlySet<string>,
): Set<string> => {
  if (sets.length === 0) return new Set(universe);
  // Start from the smallest set to minimise work.
  const ordered = [...sets].sort((a, b) => a.size - b.size);
  let acc = new Set<string>(ordered[0]);
  for (let i = 1; i < ordered.length; i++) acc = intersect(acc, ordered[i]);
  return acc;
};

/** `∪` of every set. An empty list is the empty set (an `any()` of nothing matches no one). */
export const unionAll = (sets: readonly ReadonlySet<string>[]): Set<string> => {
  const out = new Set<string>();
  for (const set of sets) for (const id of set) out.add(id);
  return out;
};

/** `|a ∩ b|` without materialising the intersection. */
export const countIntersection = (a: ReadonlySet<string>, b: ReadonlySet<string>): number => {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let count = 0;
  for (const id of small) if (large.has(id)) count += 1;
  return count;
};

/** `|a ∖ b|` without materialising the difference. */
export const countDifference = (a: ReadonlySet<string>, b: ReadonlySet<string>): number => {
  let count = 0;
  for (const id of a) if (!b.has(id)) count += 1;
  return count;
};
