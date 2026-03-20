import { fetchSettings, saveSettings } from './dbApi';

const STORAGE_KEY = 'novelcraft_api_keys';
const PREFERRED_PROVIDER_KEY = 'novelcraft_preferred_provider';
const VALID_PROVIDERS: ApiProvider[] = ['gemini', 'openrouter', 'mistral', 'claude', 'grok', 'openai', 'ollama'];

export type ApiProvider = 'gemini' | 'openrouter' | 'mistral' | 'claude' | 'grok' | 'openai' | 'ollama';

export interface ApiKeysState {
  gemini: string;
  openrouter: string;
  mistral: string;
  claude: string;
  grok: string;
  openai: string;
  ollama: string;
}

const DEFAULT_KEYS: ApiKeysState = {
  gemini: '',
  openrouter: '',
  mistral: '',
  claude: '',
  grok: '',
  openai: '',
  ollama: '',
};

let settingsFetchStarted = false;
function hydrateSettingsFromApi(): void {
  if (settingsFetchStarted) return;
  settingsFetchStarted = true;
  fetchSettings()
    .then((data) => {
      if (data?.apiKeys && typeof data.apiKeys === 'object') {
        const merged = { ...DEFAULT_KEYS, ...data.apiKeys };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      }
      if (data?.preferredProvider && VALID_PROVIDERS.includes(data.preferredProvider as ApiProvider)) {
        localStorage.setItem(PREFERRED_PROVIDER_KEY, data.preferredProvider);
      }
    })
    .catch(() => {})
    .finally(() => {});
}

/** À appeler au bootstrap de l'app pour charger les paramètres (clés API, etc.) avant le premier usage du moteur. */
export function startSettingsHydration(): void {
  hydrateSettingsFromApi();
}

export function getApiKeys(): ApiKeysState {
  hydrateSettingsFromApi();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_KEYS };
    const parsed = JSON.parse(raw) as Partial<ApiKeysState>;
    return { ...DEFAULT_KEYS, ...parsed };
  } catch {
    return { ...DEFAULT_KEYS };
  }
}

export function setApiKey(provider: ApiProvider, value: string): void {
  const keys = getApiKeys();
  keys[provider] = value;
  setApiKeys(keys);
}

export function setApiKeys(keys: Partial<ApiKeysState>): void {
  const next = { ...getApiKeys(), ...keys };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  saveSettings({ apiKeys: next }).catch(() => {});
}

export function getApiKey(provider: ApiProvider): string {
  return getApiKeys()[provider] ?? '';
}

export function getPreferredProvider(): ApiProvider {
  hydrateSettingsFromApi();
  try {
    const raw = localStorage.getItem(PREFERRED_PROVIDER_KEY);
    if (!raw) return 'gemini';
    const p = raw as ApiProvider;
    return VALID_PROVIDERS.includes(p) ? p : 'gemini';
  } catch {
    return 'gemini';
  }
}

export function setPreferredProvider(provider: ApiProvider): void {
  localStorage.setItem(PREFERRED_PROVIDER_KEY, provider);
  saveSettings({ preferredProvider: provider }).catch(() => {});
}
