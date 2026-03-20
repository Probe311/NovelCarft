/**
 * Adaptateur Claude (Anthropic) pour le moteur v1.1.
 */

import type { Message, ProviderCapabilities, GenerateOptions } from "../types";

const MODEL = "claude-3-5-haiku-20241022";
const DEFAULT_MAX_CONTEXT_TOKENS = 200_000;
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
  const maxTokens = options?.maxOutputTokens ?? 4096;
  const systemMsg = messages.find((m) => m.role === "system");
  const chatMessages = messages.filter((m) => m.role !== "system");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system: systemMsg?.content ?? "",
      messages: chatMessages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(err || `Anthropic ${r.status}`);
  }
  const data = (await r.json()) as { content?: Array<{ text?: string }> };
  return data.content?.[0]?.text ?? null;
}
