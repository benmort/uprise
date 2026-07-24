import { describe, expect, it } from "vitest";
import {
  buildSystemPrompt,
  DEFAULT_AI_SETTINGS,
  parseAiSettings,
  type AiSettings,
} from "./settings";

describe("parseAiSettings", () => {
  it("returns defaults for null, junk JSON and wrong shapes", () => {
    expect(parseAiSettings(null)).toEqual(DEFAULT_AI_SETTINGS);
    expect(parseAiSettings("not json{")).toEqual(DEFAULT_AI_SETTINGS);
    expect(parseAiSettings(JSON.stringify({ model: 5, tone: [], nickname: 1 }))).toEqual(DEFAULT_AI_SETTINGS);
  });

  it("keeps valid fields and repairs invalid ones independently", () => {
    const out = parseAiSettings(
      JSON.stringify({ model: "claude-haiku-4-5", tone: "shouty", nickname: "Ben", instructions: "AU English." }),
    );
    expect(out.model).toBe("claude-haiku-4-5");
    expect(out.tone).toBe("professional");
    expect(out.nickname).toBe("Ben");
    expect(out.instructions).toBe("AU English.");
  });

  it("caps oversized strings", () => {
    const out = parseAiSettings(
      JSON.stringify({ nickname: "n".repeat(500), instructions: "i".repeat(9000) }),
    );
    expect(out.nickname.length).toBe(100);
    expect(out.instructions.length).toBe(4000);
  });
});

describe("buildSystemPrompt", () => {
  it("is undefined for untouched defaults", () => {
    expect(buildSystemPrompt(DEFAULT_AI_SETTINGS)).toBeUndefined();
  });

  it("assembles nickname + tone + instructions", () => {
    const settings: AiSettings = {
      model: "claude-opus-4-8",
      nickname: "Ben",
      tone: "direct",
      instructions: "Use Australian English.",
    };
    const prompt = buildSystemPrompt(settings)!;
    expect(prompt).toContain("Address the user as Ben.");
    expect(prompt).toContain("direct and concise");
    expect(prompt).toContain("Use Australian English.");
  });

  it("a non-default tone alone produces a prompt", () => {
    expect(buildSystemPrompt({ ...DEFAULT_AI_SETTINGS, tone: "friendly" })).toContain("friendly");
  });
});
