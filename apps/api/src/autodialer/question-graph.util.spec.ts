import {
  expandAuthoringFormat,
  questionGraphActivatable,
  validateQuestionGraph,
  type QuestionGraphNode,
} from "./question-graph.util";

const q = (key: string, answers: Array<[string, string, string | null]>, extra: Partial<QuestionGraphNode> = {}): QuestionGraphNode => ({
  key,
  name: `Question ${key}`,
  answers: answers.map(([digit, value, nextKey]) => ({ digit, value, nextKey })),
  ...extra,
});

describe("validateQuestionGraph", () => {
  it("accepts a clean linear graph", () => {
    const graph = [
      q("q1", [["1", "Yes", "q2"], ["2", "No", "outro"]]),
      q("q2", [["1", "Labor", "outro"], ["2", "Greens", null]]),
    ];
    expect(validateQuestionGraph(graph)).toEqual([]);
    expect(questionGraphActivatable(graph)).toBe(true);
  });

  it("rejects an empty graph", () => {
    expect(validateQuestionGraph([])).toEqual([
      expect.objectContaining({ severity: "error", code: "EMPTY_GRAPH" }),
    ]);
  });

  it("flags dangling nextKey as an error", () => {
    const issues = validateQuestionGraph([q("q1", [["1", "Yes", "q9"]])]);
    expect(issues).toContainEqual(
      expect.objectContaining({ code: "DANGLING_NEXT", severity: "error", questionKey: "q1" }),
    );
    expect(questionGraphActivatable([q("q1", [["1", "Yes", "q9"]])])).toBe(false);
  });

  it("flags duplicate keys, duplicate digits, invalid digits and missing names", () => {
    const issues = validateQuestionGraph([
      { key: "q1", name: " ", answers: [{ digit: "1", value: "a", nextKey: null }, { digit: "1", value: "b", nextKey: null }, { digit: "*", value: "c", nextKey: null }] },
      q("q1", [["1", "dup", null]]),
    ]);
    const codes = issues.map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(["MISSING_NAME", "DUPLICATE_DIGIT", "INVALID_DIGIT", "DUPLICATE_KEY"]));
    expect(issues.every((i) => i.severity === "error" || i.code === "UNREACHABLE")).toBe(true);
  });

  it("warns (not errors) on unreachable questions", () => {
    const issues = validateQuestionGraph([
      q("q1", [["1", "Yes", "outro"]]),
      q("orphan", [["1", "Never", "outro"]]),
    ]);
    expect(issues).toEqual([
      expect.objectContaining({ code: "UNREACHABLE", severity: "warning", questionKey: "orphan" }),
    ]);
    expect(questionGraphActivatable([q("q1", [["1", "Yes", "outro"]]), q("orphan", [["1", "n", "outro"]])])).toBe(true);
  });

  it("warns (not errors) on cycles", () => {
    const graph = [
      q("q1", [["1", "again", "q2"]]),
      q("q2", [["1", "back", "q1"], ["2", "done", "outro"]]),
    ];
    const issues = validateQuestionGraph(graph);
    expect(issues).toEqual([expect.objectContaining({ code: "CYCLE", severity: "warning" })]);
    expect(questionGraphActivatable(graph)).toBe(true);
  });

  it("requires answers unless the question is a SWITCHBOARD", () => {
    expect(validateQuestionGraph([q("q1", [])])).toContainEqual(
      expect.objectContaining({ code: "NO_ANSWERS", severity: "error" }),
    );
    expect(validateQuestionGraph([q("q1", [], { type: "SWITCHBOARD" })])).toEqual([]);
  });
});

describe("expandAuthoringFormat", () => {
  it("chains questions sequentially with the last defaulting to outro — the source transformSurveyQuestions semantics", () => {
    const graph = expandAuthoringFormat([
      { question: "Are you planning to vote?", options: ["Yes", "No", "Undecided"] },
      { question: "Which party do you support?", options: ["Party A", "Party B"] },
    ]);
    expect(graph).toHaveLength(2);
    expect(graph[0]).toMatchObject({
      key: "q1",
      name: "Are you planning to vote?",
      answers: [
        { digit: "1", value: "Yes", nextKey: "q2" },
        { digit: "2", value: "No", nextKey: "q2" },
        { digit: "3", value: "Undecided", nextKey: "q2" },
      ],
    });
    expect(graph[1].answers.every((a) => a.nextKey === "outro")).toBe(true);
    expect(validateQuestionGraph(graph)).toEqual([]);
  });

  it("respects supplied keys and carries audio prompts", () => {
    const graph = expandAuthoringFormat([
      { key: "intro-q", question: "First?", options: ["Yes"], audioPrompt: { en: "file1" } },
      { key: "followup", question: "Second?", options: ["No"] },
    ]);
    expect(graph[0].key).toBe("intro-q");
    expect(graph[0].audioPrompt).toEqual({ en: "file1" });
    expect(graph[0].answers[0].nextKey).toBe("followup");
  });
});
