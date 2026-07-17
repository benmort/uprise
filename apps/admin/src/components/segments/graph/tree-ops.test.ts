import { describe, expect, it } from "vitest";
import type { FilterConditionNode, FilterGroupNode, FilterNode } from "@uprise/segmentation";
import {
  appendChildAtPath,
  emptyGroup,
  getNodeAtPath,
  isCondition,
  isGroup,
  moveChildAtPath,
  nextGroupKind,
  pathKey,
  removeNodeAtPath,
  replaceNodeAtPath,
  setGroupKind,
} from "./tree-ops";

const cond = (postcode: string): FilterConditionNode => ({
  kind: "condition",
  condition: { type: "contact.postcode", op: "eq", value: postcode },
});

/** root(all) → [ c(2000), any → [ c(2010), c(2020) ], none → [ c(2030) ] ] */
const buildTree = (): FilterGroupNode => ({
  kind: "all",
  children: [
    cond("2000"),
    { kind: "any", children: [cond("2010"), cond("2020")] },
    { kind: "none", children: [cond("2030")] },
  ],
});

describe("guards", () => {
  it("isGroup accepts all/any/none and rejects conditions", () => {
    expect(isGroup({ kind: "all", children: [] })).toBe(true);
    expect(isGroup({ kind: "any", children: [] })).toBe(true);
    expect(isGroup({ kind: "none", children: [] })).toBe(true);
    expect(isGroup(cond("2000"))).toBe(false);
  });

  it("isCondition mirrors isGroup", () => {
    expect(isCondition(cond("2000"))).toBe(true);
    expect(isCondition({ kind: "all", children: [] })).toBe(false);
  });
});

describe("getNodeAtPath", () => {
  it("returns the root for []", () => {
    const tree = buildTree();
    expect(getNodeAtPath(tree, [])).toBe(tree);
  });

  it("resolves direct and nested children", () => {
    const tree = buildTree();
    expect(getNodeAtPath(tree, [0])).toBe(tree.children[0]);
    expect(getNodeAtPath(tree, [1, 1])).toEqual(cond("2020"));
  });

  it("returns null for out-of-range indices", () => {
    const tree = buildTree();
    expect(getNodeAtPath(tree, [9])).toBeNull();
    expect(getNodeAtPath(tree, [1, 5])).toBeNull();
  });

  it("returns null when the path passes through a condition", () => {
    expect(getNodeAtPath(buildTree(), [0, 0])).toBeNull();
  });
});

describe("replaceNodeAtPath", () => {
  it("replaces the root when the path is []", () => {
    const next: FilterNode = { kind: "any", children: [] };
    expect(replaceNodeAtPath(buildTree(), [], next)).toBe(next);
  });

  it("replaces a nested node immutably", () => {
    const tree = buildTree();
    const out = replaceNodeAtPath(tree, [1, 0], cond("9999"));
    expect(getNodeAtPath(out, [1, 0])).toEqual(cond("9999"));
    // the original tree is untouched
    expect(getNodeAtPath(tree, [1, 0])).toEqual(cond("2010"));
    // untouched siblings keep their identity
    expect(getNodeAtPath(out, [0])).toBe(tree.children[0]);
  });

  it("is a no-op for an out-of-range path", () => {
    const tree = buildTree();
    expect(replaceNodeAtPath(tree, [7], cond("9999"))).toEqual(tree);
    expect(replaceNodeAtPath(tree, [0, 3], cond("9999"))).toEqual(tree);
  });
});

describe("removeNodeAtPath", () => {
  it("removes a direct child", () => {
    const out = removeNodeAtPath(buildTree(), [0]);
    expect(isGroup(out) && out.children.length).toBe(2);
    expect(getNodeAtPath(out, [0])).toEqual({
      kind: "any",
      children: [cond("2010"), cond("2020")],
    });
  });

  it("removes a nested child, leaving siblings in place", () => {
    const out = removeNodeAtPath(buildTree(), [1, 0]);
    expect(getNodeAtPath(out, [1])).toEqual({ kind: "any", children: [cond("2020")] });
  });

  it("never removes the root", () => {
    const tree = buildTree();
    expect(removeNodeAtPath(tree, [])).toBe(tree);
  });

  it("is a no-op for a path that does not resolve", () => {
    const tree = buildTree();
    expect(removeNodeAtPath(tree, [9])).toBe(tree);
    expect(removeNodeAtPath(tree, [0, 0])).toBe(tree);
  });

  it("does not mutate the input tree", () => {
    const tree = buildTree();
    removeNodeAtPath(tree, [1, 1]);
    expect(tree).toEqual(buildTree());
  });
});

describe("setGroupKind", () => {
  it("sets the kind of the root", () => {
    const out = setGroupKind(buildTree(), [], "any");
    expect(out.kind).toBe("any");
  });

  it("sets the kind of a nested group", () => {
    const out = setGroupKind(buildTree(), [1], "all");
    expect(getNodeAtPath(out, [1])?.kind).toBe("all");
  });

  it("returns the same tree when the kind is unchanged", () => {
    const tree = buildTree();
    expect(setGroupKind(tree, [], "all")).toBe(tree);
  });

  it("is a no-op on condition nodes and bad paths", () => {
    const tree = buildTree();
    expect(setGroupKind(tree, [0], "any")).toBe(tree);
    expect(setGroupKind(tree, [9], "any")).toBe(tree);
  });
});

describe("nextGroupKind", () => {
  it("cycles all → any → none → all", () => {
    expect(nextGroupKind("all")).toBe("any");
    expect(nextGroupKind("any")).toBe("none");
    expect(nextGroupKind("none")).toBe("all");
  });
});

describe("appendChildAtPath", () => {
  it("appends to the root", () => {
    const out = appendChildAtPath(buildTree(), [], cond("4000"));
    expect(isGroup(out) && out.children.length).toBe(4);
    expect(getNodeAtPath(out, [3])).toEqual(cond("4000"));
  });

  it("appends to a nested group", () => {
    const out = appendChildAtPath(buildTree(), [2], cond("4000"));
    expect(getNodeAtPath(out, [2, 1])).toEqual(cond("4000"));
  });

  it("is a no-op on condition nodes", () => {
    const tree = buildTree();
    expect(appendChildAtPath(tree, [0], cond("4000"))).toBe(tree);
  });
});

describe("moveChildAtPath", () => {
  it("reorders children within a group", () => {
    const out = moveChildAtPath(buildTree(), [], 0, 2);
    expect(isGroup(out) && out.children.map((c) => c.kind)).toEqual(["any", "none", "condition"]);
  });

  it("is a no-op when from === to or out of range", () => {
    const tree = buildTree();
    expect(moveChildAtPath(tree, [], 1, 1)).toBe(tree);
    expect(moveChildAtPath(tree, [], 0, 9)).toBe(tree);
    expect(moveChildAtPath(tree, [], -1, 0)).toBe(tree);
    expect(moveChildAtPath(tree, [0], 0, 1)).toBe(tree);
  });
});

describe("emptyGroup", () => {
  it("defaults to an empty any group", () => {
    expect(emptyGroup()).toEqual({ kind: "any", children: [] });
    expect(emptyGroup("all")).toEqual({ kind: "all", children: [] });
  });
});

describe("pathKey", () => {
  it("encodes the root and nested paths", () => {
    expect(pathKey("g", [])).toBe("g-root");
    expect(pathKey("g", [0, 1])).toBe("g-0.1");
    expect(pathKey("c", [0, 2])).toBe("c-0.2");
  });
});
