/**
 * Adaptateur Gemini pour le moteur v1.1.
 */

import { GoogleGenAI } from "@google/genai";
import type { Message, ProviderCapabilities, GenerateOptions } from "../types";

const MODEL = "gemini-2.5-flash";
const DEFAULT_MAX_CONTEXT_TOKENS = 1_000_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 8_192;

export function getCapabilities(): ProviderCapabilities {
  return {
    maxContextTokens: DEFAULT_MAX_CONTEXT_TOKENS,
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
  };
}

export async function generate(
  apiKey: string,
  messages: Message[],
  options?: GenerateOptions
): Promise<string | null> {
  const maxTokens = options?.maxOutputTokens ?? 8192;
  const contents = messages.map((m) => ({
    role: m.role as "user" | "model" | "system",
    parts: [{ text: m.content }],
  }));
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: MODEL,
    contents,
    config: {
      maxOutputTokens: maxTokens,
    },
  });
  return response.text ?? null;
}
