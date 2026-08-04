import { parsePrompt, resolveAudioFileId, resolveAudioUrl } from "./audio-prompt.util";

describe("parsePrompt", () => {
  it("parses name-only, id-only and per-language prompts", () => {
    expect(parsePrompt({ name: "Hello" })).toEqual({ name: "Hello", audio: null });
    expect(parsePrompt({ audio: "file1" })).toEqual({ name: null, audio: "file1" });
    expect(parsePrompt({ name: "Hi", audio: { en: "f-en", vi: "f-vi" } })).toEqual({
      name: "Hi",
      audio: { en: "f-en", vi: "f-vi" },
    });
  });

  it("returns null on junk (null, arrays, scalars, empty objects)", () => {
    expect(parsePrompt(null)).toBeNull();
    expect(parsePrompt(undefined)).toBeNull();
    expect(parsePrompt("hello")).toBeNull();
    expect(parsePrompt(["hello"])).toBeNull();
    expect(parsePrompt({})).toBeNull();
    expect(parsePrompt({ name: 42, audio: 7 })).toBeNull();
  });
});

describe("resolveAudioFileId — the audio_filename_hierarchy port", () => {
  const prompt = { name: "Hi", audio: { vi: "f-vi", en: "f-en", zh: "f-zh" } };

  it("prefers the exact language", () => {
    expect(resolveAudioFileId(prompt, "vi")).toBe("f-vi");
  });

  it("falls back to en when the language has no recording", () => {
    expect(resolveAudioFileId(prompt, "el")).toBe("f-en");
  });

  it("falls back to the first entry when there is no en", () => {
    expect(resolveAudioFileId({ audio: { vi: "f-vi", zh: "f-zh" } }, "el")).toBe("f-vi");
  });

  it("a single string id resolves regardless of language", () => {
    expect(resolveAudioFileId({ audio: "f-one" }, "vi")).toBe("f-one");
  });

  it("null ⇒ the caller speaks the name instead", () => {
    expect(resolveAudioFileId({ name: "Say me" }, "en")).toBeNull();
    expect(resolveAudioFileId(null, "en")).toBeNull();
    expect(resolveAudioFileId({ audio: {} }, "en")).toBeNull();
    expect(resolveAudioFileId({ audio: "" }, "en")).toBeNull();
  });
});

describe("resolveAudioUrl", () => {
  const urls = new Map([["f-en", "https://cdn.test/f-en.mp3"]]);

  it("maps the resolved file id to its URL", () => {
    expect(resolveAudioUrl({ audio: { en: "f-en" } }, "en", urls)).toBe("https://cdn.test/f-en.mp3");
  });

  it("returns null when the file id has no URL (missing/foreign file)", () => {
    expect(resolveAudioUrl({ audio: { en: "f-unknown" } }, "en", urls)).toBeNull();
    expect(resolveAudioUrl({ name: "Say me" }, "en", urls)).toBeNull();
  });
});
