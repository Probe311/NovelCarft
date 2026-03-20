import { useState, useEffect } from 'react';
import { ArrowLeft, Key, Save, Eye, EyeOff } from 'lucide-react';
import { getEngineConfig, setEngineConfig, type EngineConfig } from '../lib/engineConfigStorage';
import { getApiKeys, setApiKey, type ApiProvider } from '../lib/apiKeysStorage';

const API_PROVIDERS: { id: ApiProvider; label: string }[] = [
  { id: 'gemini', label: 'Google Gemini' },
  { id: 'claude', label: 'Anthropic Claude' },
  { id: 'mistral', label: 'Mistral AI' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'grok', label: 'xAI Grok' },
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'ollama', label: 'Ollama (clé API)' },
];

interface SettingsPageProps {
  onBack: () => void;
}

export function SettingsPage({ onBack }: SettingsPageProps) {
  const [config, setConfigState] = useState<EngineConfig>(() => getEngineConfig());
  const [apiKeys, setApiKeysState] = useState(() => getApiKeys());
  const [showKeys, setShowKeys] = useState<Record<ApiProvider, boolean>>(() =>
    Object.fromEntries(API_PROVIDERS.map((p) => [p.id, false])) as Record<ApiProvider, boolean>
  );
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setConfigState(getEngineConfig());
    setApiKeysState(getApiKeys());
  }, []);

  const update = (partial: Partial<EngineConfig>) => {
    setConfigState((prev) => ({ ...prev, ...partial }));
    setSaved(false);
  };

  const handleSave = () => {
    setEngineConfig(config);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex h-screen flex-col bg-[#0f0f11] text-zinc-100">
      <header className="h-14 border-b border-white/5 flex items-center justify-between px-4 lg:px-8 bg-[#0f0f11]/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            title="Retour"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <Key size={18} className="text-white" />
          </div>
          <span className="font-semibold tracking-tight">Paramètres — Moteur NovelCraft</span>
        </div>
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
        >
          <Save size={16} />
          {saved ? 'Enregistré' : 'Enregistrer'}
        </button>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto py-8 px-4 sm:px-8">
          <p className="text-zinc-500 text-sm mb-2">
            Le moteur 1.1 utilise automatiquement tous les LLM pour lesquels une clé est configurée. Aucun choix de fournisseur : orchestration transparente selon disponibilité et capacités.
          </p>
          <p className="text-zinc-600 text-xs mb-6">
            <strong className="text-zinc-500">NovelCraft Engine v1.1</strong> — multiLLM (Gemini, Claude, Mistral, OpenAI, Grok, OpenRouter, Ollama).
          </p>

          {/* Clés API */}
          <div className="mb-8 p-5 bg-zinc-900/80 border border-zinc-800 rounded-xl space-y-4">
            <div className="flex items-center gap-2 text-zinc-200 font-medium">
              <Key size={18} className="text-indigo-400" />
              Clés API
            </div>
            <p className="text-xs text-zinc-500">
              Configurez les clés des services que vous souhaitez utiliser. Le moteur choisira automatiquement parmi ceux disponibles.
            </p>
            <div className="space-y-3">
              {API_PROVIDERS.map(({ id, label }) => (
                <div key={id} className="space-y-1">
                  <label className="text-zinc-400 text-xs font-medium">{label}</label>
                  <div className="relative">
                    <input
                      type={showKeys[id] ? 'text' : 'password'}
                      value={apiKeys[id] ?? ''}
                      onChange={(e) => {
                        setApiKey(id, e.target.value);
                        setApiKeysState((prev) => ({ ...prev, [id]: e.target.value }));
                      }}
                      placeholder={`Clé ${label}...`}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg py-2.5 pl-3 pr-10 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500/50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKeys((prev) => ({ ...prev, [id]: !prev[id] }))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-zinc-500 hover:text-zinc-300 rounded"
                      title={showKeys[id] ? 'Masquer' : 'Afficher'}
                    >
                      {showKeys[id] ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
