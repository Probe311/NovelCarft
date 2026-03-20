/**
 * NovelCraft Engine v1.1 — Moteur multimodèles avec orchestration transparente.
 * Tous les providers (Ollama, Gemini, Claude, Mistral, OpenAI, Grok) participent
 * selon disponibilité et contraintes ; aucun choix de provider par l'utilisateur.
 */

import type { EnginePayloadV11, ProviderId } from "./types";
import type { ProviderConfig } from "./providers";
import { runPipeline, runPipelineStream } from "./orchestrator";

export const ENGINE_VERSION = "1.1";
export const ENGINE_DISPLAY_NAME = "NovelCraft Engine v1.1";

export type { EnginePayloadV11, ProviderId };

function getEnvApiKeys(): Partial<Record<ProviderId, string>> {
  return {
    gemini: process.env.GEMINI_API_KEY,
    claude: process.env.ANTHROPIC_API_KEY,
    mistral: process.env.MISTRAL_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    grok: process.env.XAI_API_KEY,
    openrouter: process.env.OPENROUTER_API_KEY,
    ollama: process.env.OLLAMA_API_KEY,
  };
}

function mergeApiKeys(payload: EnginePayloadV11): Partial<Record<ProviderId, string>> {
  const env = getEnvApiKeys();
  const fromPayload = payload.apiKeys ?? {};
  return {
    gemini: (fromPayload.gemini?.trim() || env.gemini) ?? undefined,
    claude: (fromPayload.claude?.trim() || env.claude) ?? undefined,
    mistral: (fromPayload.mistral?.trim() || env.mistral) ?? undefined,
    openai: (fromPayload.openai?.trim() || env.openai) ?? undefined,
    grok: (fromPayload.grok?.trim() || env.grok) ?? undefined,
    openrouter: (fromPayload.openrouter?.trim() || env.openrouter) ?? undefined,
    ollama: (fromPayload.ollama?.trim() || env.ollama) ?? undefined,
  };
}

/**
 * Point d'entrée principal. Payload rétrocompatible avec v1 :
 * - refinement.enabled / engine.ollamaReviserModel mappés sur refinementEnabled / revisionEnabled.
 * - fallbackProvider / fallbackApiKey ignorés ; l'orchestrateur choisit les providers.
 */
export async function runEngineGenerateV11(
  payload: EnginePayloadV11
): Promise<{ text: string | null }> {
  const engine = payload.engine ?? {};
  const ollamaBaseUrl = engine.ollamaBaseUrl ?? "http://localhost:11434";
  const ollamaModel = engine.ollamaModel ?? "llama3.2";
  const ollamaReviserModel = (engine.ollamaReviserModel ?? "").trim();

  const revisionEnabled =
    payload.revisionEnabled === true ||
    (!!ollamaReviserModel && ollamaReviserModel !== ollamaModel);
  const refinementEnabled =
    payload.refinementEnabled === true ||
    (payload as { refinement?: { enabled?: boolean } }).refinement?.enabled === true;

  const apiKeys = mergeApiKeys(payload);

  const config: ProviderConfig = {
    ollama: {
      baseUrl: ollamaBaseUrl,
      model: ollamaModel,
      reviserModel: ollamaReviserModel || undefined,
    },
    apiKeys: apiKeys as Partial<Record<ProviderId, string>>,
  };

  return runPipeline(
    {
      ...payload,
      revisionEnabled,
      refinementEnabled,
    },
    config
  );
}

/**
 * Génération en streaming (draft uniquement, Ollama ou fallback non-streamé).
 * Chaque chunk est envoyé via onChunk. Retourne le texte complet.
 */
export async function runEngineGenerateStreamV11(
  payload: EnginePayloadV11,
  onChunk: (chunk: string) => void
): Promise<string | null> {
  const engine = payload.engine ?? {};
  const ollamaBaseUrl = engine.ollamaBaseUrl ?? "http://localhost:11434";
  const ollamaModel = engine.ollamaModel ?? "llama3.2";
  const ollamaReviserModel = (engine.ollamaReviserModel ?? "").trim();
  const apiKeys = mergeApiKeys(payload);
  const config: ProviderConfig = {
    ollama: {
      baseUrl: ollamaBaseUrl,
      model: ollamaModel,
      reviserModel: ollamaReviserModel || undefined,
    },
    apiKeys: apiKeys as Partial<Record<ProviderId, string>>,
  };
  return runPipelineStream(payload, config, onChunk);
}
