/**
 * Registre des providers v1.1.
 */

import type { ProviderId, ProviderAdapter, Message, GenerateOptions } from "../types";
import * as ollama from "./ollama";
import * as gemini from "./gemini";
import * as claude from "./claude";
import * as mistral from "./mistral";
import * as openai from "./openai";
import * as grok from "./grok";
import * as openrouter from "./openrouter";

export interface ProviderConfig {
  ollama?: { baseUrl: string; model: string; reviserModel?: string };
  /** Clés API pour tous les providers (y compris ollama pour authentification API). */
  apiKeys: Partial<Record<ProviderId, string>>;
}

export function createAdapter(
  id: ProviderId,
  config: ProviderConfig
): ProviderAdapter | null {
  if (id === "ollama") {
    const c = config.ollama;
    const apiKey = config.apiKeys.ollama?.trim();
    if (!c?.baseUrl || !c?.model || !apiKey) return null;
    return {
      id: "ollama",
      generate: (messages: Message[], options?: GenerateOptions) =>
        ollama.generate(
          { baseUrl: c.baseUrl, model: c.model, apiKey },
          messages,
          options
        ),
      getCapabilities: ollama.getCapabilities,
    };
  }
  const apiKey = config.apiKeys[id];
  if (!apiKey?.trim()) return null;

  if (id === "gemini") {
    return {
      id: "gemini",
      generate: (messages: Message[], options?: GenerateOptions) =>
        gemini.generate(apiKey, messages, options),
      getCapabilities: gemini.getCapabilities,
    };
  }
  if (id === "claude") {
    return {
      id: "claude",
      generate: (messages: Message[], options?: GenerateOptions) =>
        claude.generate(apiKey, messages, options),
      getCapabilities: claude.getCapabilities,
    };
  }
  if (id === "mistral") {
    return {
      id: "mistral",
      generate: (messages: Message[], options?: GenerateOptions) =>
        mistral.generate(apiKey, messages, options),
      getCapabilities: mistral.getCapabilities,
    };
  }
  if (id === "openai") {
    return {
      id: "openai",
      generate: (messages: Message[], options?: GenerateOptions) =>
        openai.generate(apiKey, messages, options),
      getCapabilities: openai.getCapabilities,
    };
  }
  if (id === "grok") {
    return {
      id: "grok",
      generate: (messages: Message[], options?: GenerateOptions) =>
        grok.generate(apiKey, messages, options),
      getCapabilities: grok.getCapabilities,
    };
  }
  if (id === "openrouter") {
    return {
      id: "openrouter",
      generate: (messages: Message[], options?: GenerateOptions) =>
        openrouter.generate(apiKey, messages, options),
      getCapabilities: openrouter.getCapabilities,
    };
  }
  return null;
}

/** Ordre de priorité pour l'étape draft. */
export const DRAFT_PRIORITY: ProviderId[] = [
  "gemini",
  "claude",
  "mistral",
  "openai",
  "grok",
  "openrouter",
  "ollama",
];

/** Ordre de priorité pour révision / raffinement (préférer cloud « éditeur »). */
export const REVISION_REFINEMENT_PRIORITY: ProviderId[] = [
  "gemini",
  "claude",
  "mistral",
  "openai",
  "grok",
  "openrouter",
  "ollama",
];
