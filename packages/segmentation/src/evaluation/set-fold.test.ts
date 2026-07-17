import { describe, expect, it } from "vitest";
import type { EffectiveGroupNode, EffectiveNode } from "../composition/effective-tree";
import {
  countDifference,
  countIntersection,
  difference,
  intersect,
  intersectAll,
  union,
  unionAll,
} from "./contact-set";
import { collectEffectiveLeaves, foldEffectiveTree, type LeafResolver } from "./set-fold";

const U = new Set(["a", "b", "c", "d", "e"]);

const cond = (type: string): EffectiveNode => ({
  kind: "condition",
  layer: "intent",
  editable: true,
  condition: { type, op: "is", value: true } as never,
});

const group = (kind: "all" | "any" | "none", children: EffectiveNode[]): EffectiveGroupNode => ({
  kind,
  layer: "intent",
  editable: true,
  children,
});

/** Resolver keyed by condition type — unknown leaves fail closed (∅). */
const resolver =
  (sets: Record<string, string[]>): LeafResolver =>
  (leaf) =>
    leaf.kind === "condition" ? new Set(sets[leaf.condition.type] ?? []) : new Set();

describe("contact-set primitives", () => {
  it("intersect walks either operand order", () => {
    expect([...intersect(new Set(["a", "b"]), new Set(["b", "c"]))]).toEqual(["b"]);
    expect([...intersect(new Set(["b", "c", "d"]), new Set(["b"]))]).toEqual(["b"]);
  });
  it("union and difference", () => {
    expect(union(new Set(["a"]), new Set(["b"])).size).toBe(2);
    expect([...difference(new Set(["a", "b"]), new Set(["b"]))]).toEqual(["a"]);
  });
  it("intersectAll of nothing is the universe; unionAll of nothing is empty", () => {
    expect(intersectAll([], U).size).toBe(U.size);
    expect(unionAll([]).size).toBe(0);
  });
  it("count helpers avoid materialising", () => {
    expect(countIntersection(new Set(["a", "b"]), new Set(["b", "c"]))).toBe(1);
    expect(countDifference(new Set(["a", "b"]), new Set(["b"]))).toBe(1);
  });
});

describe("foldEffectiveTree", () => {
  it("all → intersection", () => {
    const tree = group("all", [cond("x"), cond("y")]);
    const out = foldEffectiveTree(tree, resolver({ x: ["a", "b", "c"], y: ["b", "c", "d"] }), U);
    expect([...out].sort()).toEqual(["b", "c"]);
  });

  it("any → union", () => {
    const tree = group("any", [cond("x"), cond("y")]);
    const out = foldEffectiveTree(tree, resolver({ x: ["a"], y: ["d"] }), U);
    expect([...out].sort()).toEqual(["a", "d"]);
  });

  it("none → universe minus union (NOT)", () => {
    const tree = group("none", [cond("x")]);
    const out = foldEffectiveTree(tree, resolver({ x: ["a", "b"] }), U);
    expect([...out].sort()).toEqual(["c", "d", "e"]);
  });

  it("empty all = universe (no constraint); empty any = nobody", () => {
    expect(foldEffectiveTree(group("all", []), resolver({}), U).size).toBe(U.size);
    expect(foldEffectiveTree(group("any", []), resolver({}), U).size).toBe(0);
  });

  it("nested combination folds children before parents", () => {
    // all( x, any(y, z) ) over U
    const tree = group("all", [cond("x"), group("any", [cond("y"), cond("z")])]);
    const out = foldEffectiveTree(
      tree,
      resolver({ x: ["a", "b", "c"], y: ["a"], z: ["c", "d"] }),
      U,
    );
    expect([...out].sort()).toEqual(["a", "c"]);
  });

  it("fail-closed: an unknown leaf resolves to ∅ and restricts, never widens", () => {
    const tree = group("all", [cond("x"), cond("mystery")]);
    const out = foldEffectiveTree(tree, resolver({ x: ["a", "b"] }), U);
    expect(out.size).toBe(0);
  });

  it("is iterative — a deep tree cannot stack-overflow", () => {
    let node: EffectiveNode = cond("x");
    for (let i = 0; i < 5000; i++) node = group("all", [node]);
    const out = foldEffectiveTree(node, resolver({ x: ["a"] }), U);
    expect([...out]).toEqual(["a"]);
  });

  it("collectEffectiveLeaves finds every leaf", () => {
    const tree = group("all", [cond("x"), group("any", [cond("y"), cond("z")])]);
    expect(collectEffectiveLeaves(tree)).toHaveLength(3);
  });
});
