type SmsReactionKey = "loved" | "liked" | "disliked" | "laughed at" | "emphasized" | "questioned";

export type SmsReaction = {
  key: SmsReactionKey;
  emoji: string;
  verb: string;
  quotedText: string;
};

const REACTION_LOOKUP: Record<SmsReactionKey, { emoji: string; verb: string }> = {
  loved: { emoji: "❤️", verb: "Loved" },
  liked: { emoji: "👍", verb: "Liked" },
  disliked: { emoji: "👎", verb: "Disliked" },
  "laughed at": { emoji: "😂", verb: "Laughed at" },
  emphasized: { emoji: "‼️", verb: "Emphasized" },
  questioned: { emoji: "❓", verb: "Questioned" },
};

const SMS_REACTION_PATTERN =
  /^(Loved|Liked|Disliked|Laughed at|Emphasized|Questioned)\s+[“"]([\s\S]+)[”"]$/i;

export function parseSmsReaction(body: string): SmsReaction | null {
  const message = body.trim();
  if (!message) return null;
  const match = message.match(SMS_REACTION_PATTERN);
  if (!match) return null;

  const key = match[1].toLowerCase() as SmsReactionKey;
  const reaction = REACTION_LOOKUP[key];
  const quotedText = match[2].trim();
  if (!reaction || !quotedText) return null;

  return {
    key,
    emoji: reaction.emoji,
    verb: reaction.verb,
    quotedText,
  };
}
