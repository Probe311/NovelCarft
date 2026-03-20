/**
 * Disponibilité des providers : détection Ollama + clés API, avec cache court.
 */

import type { ProviderId } from "./types";
import { createAdapter } from "./providers";
import type { ProviderConfig } from "./providers";

export type { ProviderConfig } from "./providers";

const CACHE_TTL_MS = 30_000;

interface CacheEntry {
  providers: ProviderId[];
  at: number;
}

let cache: CacheEntry | null = null;

function now(): number {
  return Date.now();
}

function isCacheValid(entry: CacheEntry): boolean {
  return now() - entry.at < CACHE_TTL_MS;
}

/**
 * Vérifie si Ollama est joignable (GET /api/tags).
 */
export async function checkOllamaAvailable(baseUrl: string): Promise<boolean> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/tags`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const r = await fetch(url, { method: "GET", signal: controller.signal });
    clearTimeout(timeout);
    return r.ok;
  } catch {
    clearTimeout(timeout);
    return false;
  }
}

/**
 * Retourne la liste des providers disponibles selon la config.
 * Utilise un cache de 30 s pour éviter de surcharger.
 * Un provider est disponible si sa clé (et pour Ollama baseUrl+model) est renseignée.
 */
export async function getAvailableProviders(
  config: ProviderConfig
): Promise<ProviderId[]> {
  if (cache && isCacheValid(cache)) {
    return cache.providers;
  }

  const result: ProviderId[] = [];

  // Ollama : baseUrl + model + clé API requis (moteur full-API)
  if (
    config.ollama?.baseUrl &&
    config.ollama?.model &&
    config.apiKeys?.ollama?.trim()
  ) {
    result.push("ollama");
  }

  // APIs : clé non vide = disponible
  const apiIds: Exclude<ProviderId, "ollama">[] = [
    "gemini",
    "claude",
    "mistral",
    "openai",
    "grok",
    "openrouter",
  ];
  for (const id of apiIds) {
    const key = config.apiKeys[id];
    if (key && key.trim()) result.push(id);
  }

  cache = { providers: result, at: now() };
  return result;
}

/**
 * Invalide le cache (utile pour tests ou après changement de config).
 */
export function invalidateAvailabilityCache(): void {
  cache = null;
}

/**
 * Retourne les adapters créés pour les providers disponibles.
 * Chaque adapter est non null car on ne demande que les ids disponibles.
 */
export function getAdaptersFor(
  available: ProviderId[],
  config: ProviderConfig
): Array<{ id: ProviderId; adapter: NonNullable<ReturnType<typeof createAdapter>> }> {
  const out: Array<{
    id: ProviderId;
    adapter: NonNullable<ReturnType<typeof createAdapter>>;
  }> = [];
  for (const id of available) {
    const adapter = createAdapter(id, config);
    if (adapter) out.push({ id, adapter });
  }
  return out;
}
