/**
 * Orchestrateur v1.1 : pipeline draft → révision → raffinement avec sélection automatique des providers.
 */

import type { Message, ProviderId } from "./types";
import {
  toMessages,
  getContextLength,
  compactContext,
  runReflection,
  COMPACTION_THRESHOLD_CHARS,
  REFLECTION_THRESHOLD_CHARS,
  type GenerateFn,
} from "../context";
import {
  getAvailableProviders,
  getAdaptersFor,
  type ProviderConfig,
} from "./availability";
import {
  DRAFT_PRIORITY,
  REVISION_REFINEMENT_PRIORITY,
} from "./providers";
import * as ollama from "./providers/ollama";
import type { EnginePayloadV11, ProviderAdapter } from "./types";

const MAX_RETRIES = 1;

function estimateCharsToTokens(chars: number): number {
  return Math.ceil(chars / 4);
}

function pickProviderForContext(
  adapters: Map<ProviderId, ProviderAdapter>,
  priority: ProviderId[],
  contextChars: number
): ProviderAdapter | null {
  const contextTokens = estimateCharsToTokens(contextChars);
  for (const id of priority) {
    const adapter = adapters.get(id);
    if (!adapter) continue;
    const cap = adapter.getCapabilities();
    if (cap.maxContextTokens >= contextTokens) return adapter;
  }
  return null;
}

async function tryGenerateWithRetry(
  adapter: ProviderAdapter,
  messages: Message[]
): Promise<string | null> {
  let lastErr: unknown;
  for (let i = 0; i <= MAX_RETRIES; i++) {
    try {
      const text = await adapter.generate(messages);
      if (text != null) return text;
    } catch (e) {
      lastErr = e;
      if (i < MAX_RETRIES) console.warn(`Provider ${adapter.id} attempt ${i + 1} failed, retrying:`, e);
    }
  }
  if (lastErr) throw lastErr;
  return null;
}

/**
 * Exécute le pipeline complet : préparation du contexte (compaction, réflexion), draft, révision optionnelle, raffinement optionnel.
 */
export async function runPipeline(
  payload: EnginePayloadV11,
  config: ProviderConfig
): Promise<{ text: string | null }> {
  const { contents, config: reqConfig, reflect, revisionEnabled, refinementEnabled } = payload;
  console.log("[engine] runPipeline start", { reflect, revisionEnabled, refinementEnabled });
  if (!contents || !Array.isArray(contents)) {
    throw new Error("contents requis");
  }

  const systemInstruction = reqConfig?.systemInstruction;
  let messages = toMessages(contents, systemInstruction);

  const available = await getAvailableProviders(config);
  if (available.length === 0) {
    throw new Error(
      "Aucun provider disponible. Configurez au moins une clé API (Gemini, Claude, Mistral, OpenAI, Grok, OpenRouter ou Ollama) dans Paramètres."
    );
  }

  const adapterList = getAdaptersFor(available, config);
  const adapters = new Map<ProviderId, ProviderAdapter>();
  for (const { id, adapter } of adapterList) {
    adapters.set(id, adapter);
  }

  const generateForContext: GenerateFn = (msgs) => {
    const adapter = pickProviderForContext(
      adapters,
      DRAFT_PRIORITY,
      getContextLength(msgs)
    );
    if (!adapter) return Promise.resolve(null);
    return adapter.generate(msgs);
  };

  // Compaction si contexte trop long
  if (getContextLength(messages) > COMPACTION_THRESHOLD_CHARS) {
    try {
      messages = await compactContext(messages, generateForContext);
    } catch (compactErr) {
      console.warn("Context compaction failed, using full context:", compactErr);
    }
  }

  // Réflexion si demandée ou contexte long
  const doReflect =
    reflect === true || getContextLength(messages) > REFLECTION_THRESHOLD_CHARS;
  if (doReflect) {
    try {
      const plan = await runReflection(messages, generateForContext);
      if (plan?.trim()) {
        const systemMsg = messages.find((m) => m.role === "system");
        const others = messages.filter((m) => m.role !== "system");
        const augmentedSystem =
          (systemMsg?.content ?? "") +
          "\n\n[PLAN DE RÉFLEXION - à respecter pour cette génération]\n" +
          plan.trim();
        messages = [
          { role: "system", content: augmentedSystem },
          ...others,
        ];
      }
    } catch (refErr) {
      console.warn("Reflection step failed, continuing without plan:", refErr);
    }
  }

  const finalSystemExcerpt =
    (messages.find((m) => m.role === "system")?.content ?? "").slice(0, 2000);

  // ---- Étape 1 : Draft ----
  const draftAdapter = pickProviderForContext(
    adapters,
    DRAFT_PRIORITY,
    getContextLength(messages)
  );
  if (!draftAdapter) {
    throw new Error(
      "Contexte trop long pour les providers disponibles. Réduisez le contexte ou ajoutez un provider à grand contexte (ex. Gemini)."
    );
  }

  let text: string | null = null;
  try {
    text = await tryGenerateWithRetry(draftAdapter, messages);
    console.log("[engine] draft done", { provider: draftAdapter.id, textLength: text?.length ?? 0 });
  } catch (draftErr) {
    // Essayer les autres providers en ordre de priorité
    for (const id of DRAFT_PRIORITY) {
      if (id === draftAdapter.id) continue;
      const alt = adapters.get(id);
      if (!alt) continue;
      try {
        text = await alt.generate(messages);
        if (text) break;
      } catch {
        // continue to next
      }
    }
    if (!text) throw draftErr;
  }

  if (!text) {
    console.warn(
      "Draft returned null — no text generated. Provider:",
      draftAdapter.id
    );
    return { text: null };
  }

  const usedForDraft = draftAdapter.id;

  // ---- Étape 2 : Révision (optionnelle) ----
  if (revisionEnabled && text) {
    const reviserPriority = REVISION_REFINEMENT_PRIORITY.filter((id) => id !== usedForDraft);
    const reviserList = [...reviserPriority, usedForDraft];
    const reviserAdapter = pickProviderForContext(
      adapters,
      reviserList,
      (text.length || 0) + 2000
    );
    if (reviserAdapter) {
      const reviserMessages: Message[] = [
        {
          role: "system",
          content:
            "Tu es un relecteur littéraire. Tu reçois un brouillon de roman. Révise-le pour le rendre plus professionnel, naturel et humain : fluidité, richesse des formulations, cohérence du ton. Réponds UNIQUEMENT par le texte révisé, en français. Pas de commentaire ni métalangue.",
        },
        {
          role: "user",
          content: `Contexte (extrait):\n${finalSystemExcerpt}\n\nBrouillon à réviser:\n${text}`,
        },
      ];
      try {
        const revised = await reviserAdapter.generate(reviserMessages);
        if (revised?.trim()) {
          text = revised;
          console.log("[engine] revision done", { provider: reviserAdapter.id, textLength: text.length });
        }
      } catch (revErr) {
        console.warn("[engine] Reviser step failed, keeping draft:", revErr);
      }
    }
  }

  // ---- Étape 3 : Raffinement (optionnel) ----
  if (refinementEnabled && text) {
    const refinerPriority = REVISION_REFINEMENT_PRIORITY;
    const refinerAdapter = pickProviderForContext(
      adapters,
      refinerPriority,
      text.length + 2500
    );
    if (refinerAdapter) {
      const refinementMessages: Message[] = [
        {
          role: "system",
          content: `Tu es un éditeur littéraire. Le texte suivant a été généré pour un roman. Affine-le en gardant le sens et en renforçant :
- Richesse : détails sensoriels (vue, son, toucher, odeur), évocation plutôt qu'énoncé, formulations variées.
- Créativité : remplacer les tournures convenues par des formulations plus personnelles et originales ; éviter les clichés.
- Profondeur : sous-texte, cohérence thématique et psychologique avec le contexte projet ; ne pas tout expliciter.
Conserve aussi le style, la fluidité et la cohérence avec le contexte. Réponds UNIQUEMENT par le texte affiné, en français. Pas de commentaire ni métalangue.`,
        },
        {
          role: "user",
          content: `Contexte projet (extrait):\n${finalSystemExcerpt}\n\nTexte à affiner:\n${text}`,
        },
      ];
      try {
        const refined = await refinerAdapter.generate(refinementMessages);
        if (refined?.trim()) {
          text = refined;
          console.log("[engine] refinement done", { provider: refinerAdapter.id, textLength: text.length });
        }
      } catch (refErr) {
        console.warn("[engine] Refinement step failed, keeping previous output:", refErr);
      }
    }
  }

  return { text };
}

/**
 * Pipeline draft-only en streaming (Ollama uniquement). Pour chaque chunk, appelle onChunk.
 * Retourne le texte complet à la fin. Si le draft adapter n'est pas Ollama, fait un generate classique et appelle onChunk une fois.
 */
export async function runPipelineStream(
  payload: EnginePayloadV11,
  config: ProviderConfig,
  onChunk: (chunk: string) => void
): Promise<string | null> {
  const { contents, config: reqConfig } = payload;
  console.log("[engine] runPipelineStream start");
  if (!contents || !Array.isArray(contents)) {
    throw new Error("contents requis");
  }
  const systemInstruction = reqConfig?.systemInstruction;
  const messages = toMessages(contents, systemInstruction);

  const available = await getAvailableProviders(config);
  if (available.length === 0) {
    throw new Error(
      "Aucun provider disponible. Configurez au moins une clé API (Gemini, Claude, Mistral, OpenAI, Grok, OpenRouter ou Ollama) dans Paramètres."
    );
  }

  const adapterList = getAdaptersFor(available, config);
  const adapters = new Map<ProviderId, ProviderAdapter>();
  for (const { id, adapter } of adapterList) {
    adapters.set(id, adapter);
  }

  const draftAdapter = pickProviderForContext(
    adapters,
    DRAFT_PRIORITY,
    getContextLength(messages)
  );
  if (!draftAdapter) {
    throw new Error(
      "Contexte trop long pour les providers disponibles."
    );
  }

  let fullText = "";
  if (draftAdapter.id === "ollama" && config.ollama?.baseUrl && config.ollama?.model && config.apiKeys?.ollama?.trim()) {
    const ollamaConfig = {
      baseUrl: config.ollama.baseUrl,
      model: config.ollama.model,
      apiKey: config.apiKeys.ollama.trim(),
    };
    console.log("[engine] draft stream (Ollama)");
    for await (const chunk of ollama.generateStream(ollamaConfig, messages)) {
      fullText += chunk;
      onChunk(chunk);
    }
    console.log("[engine] draft stream done", { textLength: fullText.length });
    return fullText || null;
  }

  console.log("[engine] draft stream fallback (non-streaming)", { provider: draftAdapter.id });
  const text = await tryGenerateWithRetry(draftAdapter, messages);
  if (text) {
    fullText = text;
    onChunk(text);
  }
  return text;
}
