import type { AiChatModelId } from "@/lib/api";

/**
 * Client-side AI assistant preferences (the "live" slice of the AI settings hub).
 * Persisted per browser in localStorage — deliberately not server state for the
 * first cut; the assembled system prompt travels with each /ai/chat request.
 */

export type AiTone = "professional" | "friendly" | "direct";

export type AiSettings = {
  model: AiChatModelId;
  nickname: string;
  tone: AiTone;
  instructions: string;
};

export const AI_SETTINGS_KEY = "uprise.ai.settings";

export const AI_MODEL_OPTIONS: Array<{ id: AiChatModelId; name: string; blurb: string }> = [
  { id: "claude-opus-4-8", name: "Claude Opus 4.8", blurb: "Most capable — best for drafting, analysis and long context." },
  { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", blurb: "Balanced speed and quality for everyday work." },
  { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", blurb: "Fastest and cheapest — quick questions and rewrites." },
];

export const AI_TONE_OPTIONS: Array<{ id: AiTone; label: string; hint: string }> = [
  { id: "professional", label: "Professional", hint: "Measured, precise, workplace-ready." },
  { id: "friendly", label: "Friendly", hint: "Warm and conversational." },
  { id: "direct", label: "Direct", hint: "Short, blunt, no padding." },
];

export const DEFAULT_AI_SETTINGS: AiSettings = {
  model: "claude-opus-4-8",
  nickname: "",
  tone: "professional",
  instructions: "",
};

const VALID_MODELS = new Set(AI_MODEL_OPTIONS.map((m) => m.id));
const VALID_TONES = new Set(AI_TONE_OPTIONS.map((t) => t.id));

/** Parse a stored settings blob, discarding anything malformed field-by-field. */
export function parseAiSettings(raw: string | null): AiSettings {
  if (!raw) return { ...DEFAULT_AI_SETTINGS };
  try {
    const parsed = JSON.parse(raw) as Partial<AiSettings>;
    return {
      model: VALID_MODELS.has(parsed.model as AiChatModelId) ? (parsed.model as AiChatModelId) : DEFAULT_AI_SETTINGS.model,
      nickname: typeof parsed.nickname === "string" ? parsed.nickname.slice(0, 100) : "",
      tone: VALID_TONES.has(parsed.tone as AiTone) ? (parsed.tone as AiTone) : DEFAULT_AI_SETTINGS.tone,
      instructions: typeof parsed.instructions === "string" ? parsed.instructions.slice(0, 4000) : "",
    };
  } catch {
    return { ...DEFAULT_AI_SETTINGS };
  }
}

export function loadAiSettings(): AiSettings {
  if (typeof window === "undefined") return { ...DEFAULT_AI_SETTINGS };
  return parseAiSettings(window.localStorage.getItem(AI_SETTINGS_KEY));
}

export function saveAiSettings(settings: AiSettings): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(settings));
}

const TONE_LINES: Record<AiTone, string> = {
  professional: "Keep a professional, precise tone.",
  friendly: "Keep a warm, friendly, conversational tone.",
  direct: "Be direct and concise — short sentences, no padding.",
};

/**
 * Fold the personalisation settings into the system prompt sent with each chat.
 * Returns undefined when nothing is customised so the request stays minimal.
 */
export function buildSystemPrompt(settings: AiSettings): string | undefined {
  const parts: string[] = [];
  if (settings.nickname.trim()) parts.push(`Address the user as ${settings.nickname.trim()}.`);
  if (settings.tone !== "professional" || parts.length > 0) parts.push(TONE_LINES[settings.tone]);
  if (settings.instructions.trim()) parts.push(settings.instructions.trim());
  return parts.length ? parts.join(" ") : undefined;
}
