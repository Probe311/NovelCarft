/**
 * Adaptateur Ollama pour le moteur v1.1.
 */

import type { Message, ProviderCapabilities, GenerateOptions } from "../types";

const OLLAMA_TIMEOUT_MS = 120_000;

/** Estimation : beaucoup de modèles Ollama supportent 128k tokens. */
const DEFAULT_MAX_CONTEXT_TOKENS = 128_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 8_192;

export interface OllamaConfig {
  baseUrl: string;
  model: string;
  /** Clé API pour Ollama (si le serveur exige une authentification). */
  apiKey?: string;
}

export function getCapabilities(): ProviderCapabilities {
  return {
    maxContextTokens: DEFAULT_MAX_CONTEXT_TOKENS,
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
  };
}

export async function generate(
  config: OllamaConfig,
  messages: Message[],
  _options?: GenerateOptions
): Promise<string | null> {
  const url = `${config.baseUrl.replace(/\/$/, "")}/api/chat`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.apiKey?.trim()) {
    headers["Authorization"] = `Bearer ${config.apiKey.trim()}`;
  }
  try {
    const r = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: false,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!r.ok) {
      const err = await r.text();
      throw new Error(err || `Ollama ${r.status}`);
    }
    const data = (await r.json()) as { message?: { content?: string } };
    return data.message?.content ?? null;
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

/** Génère en streaming ; yield des chunks de texte (deltas). */
export async function* generateStream(
  config: OllamaConfig,
  messages: Message[],
  _options?: GenerateOptions
): AsyncGenerator<string> {
  const url = `${config.baseUrl.replace(/\/$/, "")}/api/chat`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.apiKey?.trim()) {
    headers["Authorization"] = `Bearer ${config.apiKey.trim()}`;
  }
  try {
    const r = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: true,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!r.ok) {
      const err = await r.text();
      throw new Error(err || `Ollama ${r.status}`);
    }
    const reader = r.body?.getReader();
    if (!reader) throw new Error("Ollama stream: no body");
    const dec = new TextDecoder();
    let buffer = "";
    let lastContent = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += dec.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const t = line.trim();
        if (!t) continue;
        try {
          const data = JSON.parse(t) as { message?: { content?: string }; delta?: { content?: string } };
          const content = data.message?.content ?? data.delta?.content ?? "";
          if (content && content !== lastContent) {
            const delta = content.startsWith(lastContent) ? content.slice(lastContent.length) : content;
            lastContent = content;
            if (delta) yield delta;
          }
        } catch {
          // ignore malformed line
        }
      }
    }
  } finally {
    clearTimeout(timeout);
  }
}
