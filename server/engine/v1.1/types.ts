/**
 * Types pour NovelCraft Engine v1.1 — orchestration multi-providers.
 */

export type ProviderId =
  | "ollama"
  | "gemini"
  | "claude"
  | "mistral"
  | "openai"
  | "grok"
  | "openrouter";

export type Message = { role: string; content: string };

export interface ProviderCapabilities {
  maxContextTokens: number;
  maxOutputTokens: number;
}

export interface GenerateOptions {
  maxOutputTokens?: number;
}

export type GenerateFn = (
  messages: Message[],
  options?: GenerateOptions
) => Promise<string | null>;

export interface ProviderAdapter {
  id: ProviderId;
  generate: GenerateFn;
  getCapabilities: () => ProviderCapabilities;
}

/** Clés API par provider (optionnel ; si absent, lecture depuis env). */
export interface EngineApiKeys {
  gemini?: string;
  claude?: string;
  mistral?: string;
  openai?: string;
  grok?: string;
  openrouter?: string;
  ollama?: string;
}

export interface EnginePayloadV11 {
  contents: Array<{ role: string; parts: Array<{ text: string }> }>;
  config?: { systemInstruction?: string };
  /** Active une phase de planification avant génération (réflexion adaptative). */
  reflect?: boolean;
  engine?: {
    ollamaModel?: string;
    ollamaReviserModel?: string;
    ollamaBaseUrl?: string;
  };
  /** Révision = deuxième étape (modèle réviseur). */
  revisionEnabled?: boolean;
  /** Raffinement = troisième étape (polish final). */
  refinementEnabled?: boolean;
  /** Clés API (client) ; fusionnées avec env côté serveur. */
  apiKeys?: EngineApiKeys;
}

export interface OrchestratorOptions {
  ollamaBaseUrl: string;
  ollamaModel: string;
  ollamaReviserModel: string;
  apiKeys: Record<ProviderId, string | undefined>;
  revisionEnabled: boolean;
  refinementEnabled: boolean;
}
