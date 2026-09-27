import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

export function getAnthropic(): Anthropic | null {
  if (_client) return _client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  _client = new Anthropic({ apiKey: key });
  return _client;
}

export function isAnthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Default model + thinking configuration for the consultation assistant.
 * Opus 4.7 is the latest, adaptive-thinking-only model — `effort: "medium"`
 * keeps responses snappy for a chat surface without sacrificing nuance.
 *
 * If you want faster/cheaper responses, switch to `claude-sonnet-4-6`.
 */
export const ASSISTANT_MODEL = "claude-opus-4-7";
