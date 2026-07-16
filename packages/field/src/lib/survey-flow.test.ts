import { describe, expect, it } from "vitest";
import { entryQuestionKey, resolveNextQuestionKey, type FlowQuestion } from "./survey-flow";

const qs: FlowQuestion[] = [
  { key: "a", options: [{ value: "yes", nextQuestionKey: "c" }, { value: "no", isTerminal: true }] },
  { key: "b", defaultNextQuestionKey: "a" },
  { key: "c" },
];

describe("survey-flow", () => {
  describe("entryQuestionKey", () => {
    it("uses the configured entry when it exists", () => {
      expect(entryQuestionKey({ entryQuestionKey: "b", questions: qs })).toBe("b");
    });
    it("falls back to the first question when entry is unset or dangling", () => {
      expect(entryQuestionKey({ entryQuestionKey: null, questions: qs })).toBe("a");
      expect(entryQuestionKey({ entryQuestionKey: "ghost", questions: qs })).toBe("a");
    });
    it("returns null for an empty survey", () => {
      expect(entryQuestionKey({ questions: [] })).toBeNull();
    });
  });

  describe("resolveNextQuestionKey", () => {
    it("follows an option's explicit edge", () => {
      expect(resolveNextQuestionKey(qs[0], qs[0].options![0], qs)).toBe("c");
    });
    it("ends the survey on a terminal option", () => {
      expect(resolveNextQuestionKey(qs[0], qs[0].options![1], qs)).toBeNull();
    });
    it("uses the question default edge when no option overrides", () => {
      expect(resolveNextQuestionKey(qs[1], null, qs)).toBe("a");
    });
    it("falls through to the next question by order when there's no edge", () => {
      expect(resolveNextQuestionKey(qs[2], null, qs)).toBeNull(); // c is last
      expect(resolveNextQuestionKey(qs[0], null, qs)).toBe("b"); // a → next by order
    });
    it("treats a dangling option edge as a fall-through, not a dead end", () => {
      const q: FlowQuestion = { key: "x", options: [{ value: "v", nextQuestionKey: "ghost" }] };
      const list = [q, { key: "y" }];
      expect(resolveNextQuestionKey(q, q.options![0], list)).toBe("y");
    });
  });
});
