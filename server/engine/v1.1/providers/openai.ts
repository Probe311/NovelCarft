/**
 * Adaptateur OpenAI pour le moteur v1.1.
 */

import type { Message, ProviderCapabilities, GenerateOptions } from "../types";

const MODEL = "gpt-4o-mini";
const DEFAULT_MAX_CONTEXT_TOKENS = 128_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 16_384;

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
  const chatMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));
  const body = {
    model: MODEL,
    max_tokens: maxTokens,
    messages: systemMsg
      ? [{ role: "system" as const, content: systemMsg.content }, ...chatMessages]
      : chatMessages,
  };
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(err || `OpenAI ${r.status}`);
  }
  const data = (await r.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? null;
}
