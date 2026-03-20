/**
 * NovelCraft Engine v1 — Moteur de rédaction local (Ollama) + révision + raffinement.
 *
 * Dépendances du moteur (toutes dans le projet) :
 * - Node fetch (HTTP vers Ollama, Claude)
 * - @google/genai (Gemini pour raffinement et secours)
 * - Ollama : service externe à lancer par l'utilisateur (non fourni par le projet).
 */

import { GoogleGenAI } from "@google/genai";
import {
  toMessages as contextToMessages,
  getContextLength,
  compactContext as contextCompactContext,
  runReflection as contextRunReflection,
  COMPACTION_THRESHOLD_CHARS,
  REFLECTION_THRESHOLD_CHARS,
  type Message,
} from "./context";

// --- Constantes et nom de version ---
export const ENGINE_VERSION = "1";
export const ENGINE_DISPLAY_NAME = "NovelCraft Engine v1";
export { COMPACTION_THRESHOLD_CHARS, REFLECTION_THRESHOLD_CHARS };

const OLLAMA_TIMEOUT_MS = 120_000;

// --- Types ---
export type EnginePayload = {
  contents: Array<{ role: string; parts: Array<{ text: string }> }>;
  config?: { systemInstruction?: string };
  engine?: {
    ollamaModel?: string;
    ollamaReviserModel?: string;
    ollamaBaseUrl?: string;
  };
  refinement?: {
    enabled?: boolean;
    provider?: "gemini" | "claude";
    apiKey?: string;
  };
  fallbackApiKey?: string;
  fallbackProvider?: "gemini" | "claude";
  /** Active une phase de planification avant génération (réflexion adaptative). */
  reflect?: boolean;
};

export type { Message };

function toMessages(
  contents: EnginePayload["contents"],
  systemInstruction?: string
): Message[] {
  return contextToMessages(contents, systemInstruction);
}

// --- Ollama ---
export async function callOllama(
  baseUrl: string,
  model: string,
  messages: Message[]
): Promise<string | null> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/chat`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream: false }),
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

// --- Raffinement (externe) ---
export async function callRefinement(
  provider: "gemini" | "claude",
  apiKey: string,
  rawText: string,
  contextExcerpt: string
): Promise<string | null> {
  const systemPrompt = `Tu es un éditeur littéraire. Le texte suivant a été généré pour un roman. Affine-le en gardant le sens et en renforçant :
- Richesse : détails sensoriels (vue, son, toucher, odeur), évocation plutôt qu'énoncé, formulations variées.
- Créativité : remplacer les tournures convenues par des formulations plus personnelles et originales ; éviter les clichés.
- Profondeur : sous-texte, cohérence thématique et psychologique avec le contexte projet ; ne pas tout expliciter.
Conserve aussi le style, la fluidité et la cohérence avec le contexte. Réponds UNIQUEMENT par le texte affiné, en français. Pas de commentaire ni métalangue.`;
  const userPrompt = `Contexte projet (extrait):\n${contextExcerpt.slice(0, 2000)}\n\nTexte à affiner:\n${rawText}`;
  const messages = [
    { role: "system" as const, content: systemPrompt },
    { role: "user" as const, content: userPrompt },
  ];
  if (provider === "gemini") {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: messages.map((m) => ({ role: m.role, parts: [{ text: m.content }] })),
      config: {},
    });
    return response.text ?? null;
  }
  if (provider === "claude") {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 4096,
        system: messages.find((m) => m.role === "system")?.content ?? "",
        messages: messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content })),
      }),
    });
    if (!r.ok) throw new Error(await r.text());
    const data = (await r.json()) as { content?: Array<{ text?: string }> };
    return data.content?.[0]?.text ?? null;
  }
  return null;
}

// --- Secours (externe) ---
export async function callFallback(
  provider: "gemini" | "claude",
  apiKey: string,
  messages: Message[]
): Promise<string | null> {
  const systemMsg = messages.find((m) => m.role === "system");
  const chatMessages = messages.filter((m) => m.role !== "system");
  if (provider === "gemini") {
    const contents = messages.map((m) => ({ role: m.role, parts: [{ text: m.content }] }));
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents,
      config: {},
    });
    return response.text ?? null;
  }
  if (provider === "claude") {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 4096,
        system: systemMsg?.content ?? "",
        messages: chatMessages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });
    if (!r.ok) throw new Error(await r.text());
    const data = (await r.json()) as { content?: Array<{ text?: string }> };
    return data.content?.[0]?.text ?? null;
  }
  return null;
}

// --- Point d'entrée principal ---
export async function runEngineGenerate(payload: EnginePayload): Promise<{ text: string | null }> {
  const {
    contents,
    config,
    engine = {},
    refinement = {},
    fallbackApiKey: clientFallbackKey,
    fallbackProvider: clientFallbackProvider,
  } = payload;

  if (!contents || !Array.isArray(contents)) {
    throw new Error("contents requis");
  }

  const ollamaModel = engine.ollamaModel || "llama3.2";
  const ollamaReviserModel = (engine.ollamaReviserModel || "").trim();
  const ollamaBaseUrl = engine.ollamaBaseUrl || "http://localhost:11434";
  const refinementEnabled = refinement.enabled === true && refinement.apiKey?.trim();
  const refinementProvider = refinement.provider || "gemini";
  const refinementApiKey = refinement.apiKey?.trim();
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  const fallbackApiKey =
    (clientFallbackKey && clientFallbackKey.trim()) ||
    (clientFallbackProvider === "gemini" ? GEMINI_API_KEY : ANTHROPIC_API_KEY);
  const fallbackProvider = clientFallbackProvider || "gemini";

  const systemInstruction = config?.systemInstruction;
  let messages = toMessages(contents, systemInstruction);

  const ollamaGenerate = (msgs: Message[]) =>
    callOllama(ollamaBaseUrl, ollamaModel, msgs);

  // Compaction du contexte (self-summarization) si trop long
  if (getContextLength(messages) > COMPACTION_THRESHOLD_CHARS) {
    try {
      messages = await contextCompactContext(messages, ollamaGenerate);
    } catch (compactErr) {
      console.warn("Context compaction failed, using full context:", compactErr);
    }
  }

  const effectiveSystemInstruction =
    messages[0]?.role === "system" ? messages[0].content : systemInstruction || "";

  // Réflexion adaptative : planification avant génération si demandé ou contexte long
  const reflect =
    payload.reflect === true || getContextLength(messages) > REFLECTION_THRESHOLD_CHARS;
  if (reflect) {
    try {
      const plan = await contextRunReflection(messages, ollamaGenerate);
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
  const finalSystemInstruction =
    messages[0]?.role === "system" ? messages[0].content : effectiveSystemInstruction;

  let text: string | null = null;
  let usedFallback = false;

  try {
    text = await callOllama(ollamaBaseUrl, ollamaModel, messages);
  } catch (ollamaErr) {
    console.warn("Ollama unavailable, using fallback:", ollamaErr);
    usedFallback = true;
    if (!fallbackApiKey) {
      throw new Error(
        "Moteur local (Ollama) indisponible. Lancez Ollama ou configurez une clé API de secours dans Paramètres."
      );
    }
    text = await callFallback(fallbackProvider as "gemini" | "claude", fallbackApiKey, messages);
  }

  // Pipeline draft → révision (modèle réviseur local)
  if (text && ollamaReviserModel && ollamaReviserModel !== ollamaModel && !usedFallback) {
    try {
      const reviserMessages: Message[] = [
        {
          role: "system",
          content:
            "Tu es un relecteur littéraire. Tu reçois un brouillon de roman. Révise-le pour le rendre plus professionnel, naturel et humain : fluidité, richesse des formulations, cohérence du ton. Réponds UNIQUEMENT par le texte révisé, en français. Pas de commentaire ni métalangue.",
        },
        {
          role: "user",
          content: `Contexte (extrait):\n${finalSystemInstruction.slice(0, 1500)}\n\nBrouillon à réviser:\n${text}`,
        },
      ];
      const revised = await callOllama(ollamaBaseUrl, ollamaReviserModel, reviserMessages);
      if (revised?.trim()) text = revised;
    } catch (revErr) {
      console.warn("Reviser model failed, keeping primary output:", revErr);
    }
  }

  if (text && refinementEnabled && refinementApiKey && !usedFallback) {
    try {
      const refined = await callRefinement(
        refinementProvider as "gemini" | "claude",
        refinementApiKey,
        text,
        finalSystemInstruction
      );
      if (refined?.trim()) text = refined;
    } catch (refErr) {
      console.warn("Refinement failed, keeping raw output:", refErr);
    }
  }

  return { text };
}
