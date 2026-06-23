import { describe, expect, it } from "vitest";
import { parseSmsReaction } from "./sms-reactions";

describe("parseSmsReaction", () => {
  it("parses iPhone reaction format with smart quotes", () => {
    const parsed = parseSmsReaction(
      "Loved “Hi Nala, instead of per diems, you can charge dinners back to your room.”",
    );
    expect(parsed).toEqual({
      key: "loved",
      emoji: "❤️",
      verb: "Loved",
      quotedText: "Hi Nala, instead of per diems, you can charge dinners back to your room.",
    });
  });

  it("parses supported reaction verbs with straight quotes", () => {
    const parsed = parseSmsReaction('Laughed at "See you Tuesday night"');
    expect(parsed?.key).toBe("laughed at");
    expect(parsed?.emoji).toBe("😂");
    expect(parsed?.quotedText).toBe("See you Tuesday night");
  });

  it("returns null for normal replies", () => {
    expect(parseSmsReaction("Thanks so much for the update!")).toBeNull();
  });
});
