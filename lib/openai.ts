import OpenAI from "openai";

let client: OpenAI | null = null;

export function getOpenAI(): OpenAI | null {
  if (client) return client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  client = new OpenAI({ apiKey });
  return client;
}

export function isOpenAIConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export const RESEARCH_MODEL = process.env.OPENAI_RESEARCH_MODEL || "gpt-5.4";
export const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-5.4-mini";
export const VISION_MODEL = process.env.OPENAI_VISION_MODEL || "gpt-5.4-mini";
