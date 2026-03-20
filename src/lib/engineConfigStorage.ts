/**
 * Configuration du moteur NovelCraft v1.1 : révision.
 * Les clés API sont dans apiKeysStorage ; le moteur choisit automatiquement les providers disponibles.
 */

import { fetchSettings, saveSettings } from "./dbApi";

const STORAGE_KEY = "novelcraft_engine_config";

export interface EngineConfig {
  /** Activer la révision (second modèle améliore le brouillon). */
  revisionEnabled: boolean;
  /** @deprecated v1.1 — conservé pour rétrocompat. */
  refinementProvider?: string;
  refinementApiKey?: string;
  fallbackProvider?: string;
  fallbackApiKey?: string;
}

const DEFAULT_CONFIG: EngineConfig = {
  revisionEnabled: false,
};

let engineConfigHydrateStarted = false;
function hydrateEngineConfigFromApi(): void {
  if (engineConfigHydrateStarted) return;
  engineConfigHydrateStarted = true;
  fetchSettings()
    .then((data) => {
      if (data?.engineConfig && typeof data.engineConfig === "object") {
        const merged = { ...DEFAULT_CONFIG, ...data.engineConfig } as EngineConfig;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      }
    })
    .catch(() => {})
    .finally(() => {});
}

export function getEngineConfig(): EngineConfig {
  hydrateEngineConfigFromApi();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    const parsed = JSON.parse(raw) as Partial<EngineConfig>;
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function setEngineConfig(config: Partial<EngineConfig>): void {
  const current = getEngineConfig();
  const next = { ...current, ...config };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  saveSettings({ engineConfig: next }).catch(() => {});
}
