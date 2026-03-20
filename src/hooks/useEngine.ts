import { useState } from 'react';
import { buildSystemInstruction, getRecentText } from '../lib/contextBuilder';
import type { NarrativeContextInput } from '../lib/contextBuilder';
import { getEngineConfig } from '../lib/engineConfigStorage';
import { getApiKeys } from '../lib/apiKeysStorage';

async function engineGenerate(
  contents: Array<{ role: string; parts: Array<{ text: string }> }>,
  config?: { systemInstruction?: string },
  options?: { reflect?: boolean }
) {
  const engineConfig = getEngineConfig();
  const apiKeys = getApiKeys();
  const res = await fetch('/api/engine/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      config: config || {},
      reflect: options?.reflect === true,
      revisionEnabled: engineConfig.revisionEnabled,
      apiKeys: {
        gemini: apiKeys.gemini || undefined,
        claude: apiKeys.claude || undefined,
        mistral: apiKeys.mistral || undefined,
        openai: apiKeys.openai || undefined,
        grok: apiKeys.grok || undefined,
        openrouter: apiKeys.openrouter || undefined,
        ollama: apiKeys.ollama || undefined,
      },
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    if (res.status === 404) {
      throw new Error(
        'Moteur NovelCraft indisponible. Lancez l\'application avec "npm run dev" (et non pas uniquement Vite) pour activer le moteur local.'
      );
    }
    throw new Error(err.error || 'API error');
  }
  const data = await res.json();
  const text = data.text as string | null;
  if (import.meta.env?.DEV) {
    if (text == null) console.warn('[NovelCraft] engineGenerate API returned null text', { ok: res.ok });
    else console.log('[NovelCraft] engineGenerate done', { textLength: text.length });
  }
  return text;
}

const MAX_CONTINUATION_LOOPS = 6;
const CONTINUATION_CHUNK_THRESHOLD = 1800;
const CONTINUATION_PROMPT = 'Continue le texte précédent immédiatement, sans répéter la fin, pour assurer une continuité parfaite. Respecte la Bible du projet et la logique narrative. Réponds UNIQUEMENT par la suite du récit en français.';

/** Appelle engineGenerate et enchaîne jusqu'à MAX_CONTINUATION_LOOPS fois si la sortie est longue (heuristique MAX_TOKENS). */
async function engineGenerateWithContinuation(
  contents: Array<{ role: string; parts: Array<{ text: string }> }>,
  config?: { systemInstruction?: string },
  options?: { reflect?: boolean }
): Promise<string | null> {
  let fullText = '';
  let currentContents = contents;
  for (let i = 0; i < MAX_CONTINUATION_LOOPS; i++) {
    const chunk = await engineGenerate(currentContents, config, options);
    if (!chunk?.trim()) break;
    fullText += (fullText && !fullText.endsWith('\n') ? '\n\n' : '') + chunk.trim();
    const shouldContinue = chunk.length > CONTINUATION_CHUNK_THRESHOLD && i < MAX_CONTINUATION_LOOPS - 1;
    if (!shouldContinue) break;
    currentContents = [
      ...currentContents,
      { role: 'model' as const, parts: [{ text: chunk }] },
      { role: 'user' as const, parts: [{ text: CONTINUATION_PROMPT }] },
    ];
  }
  return fullText || null;
}

async function engineGenerateStream(
  contents: Array<{ role: string; parts: Array<{ text: string }> }>,
  config?: { systemInstruction?: string },
  options?: { reflect?: boolean },
  callbacks: { onChunk: (chunk: string) => void; onDone: (fullText: string | null) => void; onError: (err: Error) => void }
): Promise<void> {
  const engineConfig = getEngineConfig();
  const apiKeys = getApiKeys();
  if (import.meta.env?.DEV) console.log('[NovelCraft] engineGenerateStream start');
  try {
    const res = await fetch('/api/engine/generate-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        config: config || {},
        reflect: options?.reflect === true,
        revisionEnabled: engineConfig.revisionEnabled,
        apiKeys: {
          gemini: apiKeys.gemini || undefined,
          claude: apiKeys.claude || undefined,
          mistral: apiKeys.mistral || undefined,
          openai: apiKeys.openai || undefined,
          grok: apiKeys.grok || undefined,
          openrouter: apiKeys.openrouter || undefined,
          ollama: apiKeys.ollama || undefined,
        },
      }),
    });
    if (!res.ok) {
      if (res.status === 404) {
        if (import.meta.env?.DEV) {
          console.warn(
            '[NovelCraft] engineGenerateStream 404, fallback to non-streaming. ' +
              'Pour activer le streaming, lancez l\'app avec "npm run dev" (Vite + API), pas uniquement "vite".'
          );
        }
        const fallbackText = await engineGenerate(contents, config, options);
        if (fallbackText) callbacks.onChunk(fallbackText);
        callbacks.onDone(fallbackText ?? null);
        return;
      }
      const errData = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(errData.error || 'Stream API error');
    }
    const reader = res.body?.getReader();
    if (!reader) {
      callbacks.onDone(null);
      return;
    }
    const dec = new TextDecoder();
    let buffer = '';
    let fullText = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += dec.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const t = line.trim();
        if (!t || !t.startsWith('data: ')) continue;
        try {
          const data = JSON.parse(t.slice(6)) as { chunk?: string; done?: boolean; text?: string | null; error?: string };
          if (data.error) {
            callbacks.onError(new Error(data.error));
            return;
          }
          if (data.chunk != null) {
            fullText += data.chunk;
            callbacks.onChunk(data.chunk);
          }
          if (data.done === true) {
            const final = data.text != null ? data.text : fullText;
            if (import.meta.env?.DEV) console.log('[NovelCraft] engineGenerateStream done', { textLength: final?.length ?? 0 });
            callbacks.onDone(final ?? null);
            return;
          }
        } catch (e) {
          // skip malformed line
        }
      }
    }
    if (import.meta.env?.DEV) console.log('[NovelCraft] engineGenerateStream done (eof)', { textLength: fullText.length });
    callbacks.onDone(fullText || null);
  } catch (err) {
    console.error('[NovelCraft] engineGenerateStream error:', err);
    callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    callbacks.onDone(null);
  }
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

/** Fiche personnage pour le contexte IA */
export interface CharacterFiche {
  id: string;
  name: string;
  role: string;
  description: string;
}

/** Point d'intrigue avec statut */
export type PlotPointStatus = 'pending' | 'active' | 'resolved';

export interface PlotPointFiche {
  id: string;
  title: string;
  description: string;
  status: PlotPointStatus;
}

export interface ProjectContext {
  // Story
  outline: string;
  plotPoints: PlotPointFiche[];
  themes: string;
  inspiration: string;

  // World
  universe: string;
  setting: string;
  magicSystem: string;
  history: string;
  /** Lore & Genèse (règles du monde, mythes, magie...) */
  lore: string;
  factions: string[];
  /** Lieux clés (nom + description) pour le contexte IA */
  locations: Array<{ id: string; name: string; description: string }>;

  // People & Style
  /** Personnages (fiches nom, rôle, description) */
  characters: CharacterFiche[];
  authors: string[];
  /** Auteur de référence unique (ex. Victor Hugo) pour réécriture et génération */
  referenceAuthor: string;
  style: string;
  /** Registre : littéraire, populaire, SFFF, thriller, romance, etc. */
  register: string;
  /** POV : 1re personne, 3e limité, 3e omniscient, etc. */
  pov: string;
  /** Rythme : phrases courtes/longues, proportion dialogue vs description */
  rhythm: string;
  /** Ton par défaut : sombre, ironique, lyrique, neutre, etc. */
  tone: string;
  /** Note sur ce qu'on emprunte aux auteurs (dialogues, descriptions, tension…) */
  authorNotes: string;

  /** Chapitres (titres + résumé + objectif), ordre = ordre des H1 dans le doc */
  chapterInfos: Array<{ title: string; summary?: string; plotGoal?: string }>;

  /** Livres de la saga (structure optionnelle ; un seul document pour l’instant) */
  books: Array<{ id: string; title: string; summary: string }>;

  // Misc
  notes: string;
}

export type GetManuscriptText = () => string;
export type GetNarrativeContext = () => NarrativeContextInput | undefined;

export type AutonomousType = 'paragraph' | 'dialogue' | 'chapter';
export type AutonomousLength = 'short' | 'medium' | 'long';

export const useEngine = (
  context: ProjectContext,
  getManuscriptText?: GetManuscriptText,
  getNarrativeContext?: GetNarrativeContext
) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const getSystemInstruction = () => {
    const narrativeInput = getNarrativeContext?.();
    const fullText = getManuscriptText?.() ?? '';
    const recentText = narrativeInput?.recentText ?? getRecentText(fullText);
    return buildSystemInstruction(context, narrativeInput ? '' : recentText, narrativeInput);
  };

  const sendMessage = async (text: string) => {
    setIsLoading(true);
    const newMessages = [...messages, { role: 'user', text } as ChatMessage];
    setMessages(newMessages);
    const systemInstruction = getSystemInstruction();

    try {
      const reply = await engineGenerate(
        newMessages.map(m => ({ role: m.role, parts: [{ text: m.text }] })),
        { systemInstruction }
      );
      if (reply) {
        setMessages(prev => [...prev, { role: 'model', text: reply }]);
      }
    } catch (error) {
      console.error("Engine Error:", error);
      const msg = error instanceof Error ? error.message : "Erreur lors du traitement.";
      setMessages(prev => [...prev, { role: 'model', text: msg }]);
    } finally {
      setIsLoading(false);
    }
  };

  const inlineUserMessage = (prompt: string, currentText: string) =>
    `En tenant compte du Monde (univers, cadre, factions), de l'Histoire (intrigue, chapitres, objectifs) et des Personnages définis dans le projet (sidebar), effectue la tâche suivante.

Contexte : l'utilisateur écrit un roman en français. Respecte le POV, le registre, le ton et le rythme du projet.

Segment de texte actuel : "${currentText}"

Tâche : ${prompt}

Prose riche et évocatrice. Réponds UNIQUEMENT par le texte demandé en français, sans commentaire ni métalangue.`;

  const generateInline = async (prompt: string, currentText: string) => {
    const systemInstruction = getSystemInstruction();
    try {
      return await engineGenerate(
        [{ role: 'user', parts: [{ text: inlineUserMessage(prompt, currentText) }] }],
        { systemInstruction },
        { reflect: false }
      );
    } catch (error) {
      console.error("Inline Gen Error:", error);
      return null;
    }
  };

  const generateInlineStream = (
    prompt: string,
    currentText: string,
    callbacks: { onChunk: (chunk: string) => void; onDone: (fullText: string | null) => void; onError: (err: Error) => void }
  ) => {
    const systemInstruction = getSystemInstruction();
    return engineGenerateStream(
      [{ role: 'user', parts: [{ text: inlineUserMessage(prompt, currentText) }] }],
      { systemInstruction },
      { reflect: false },
      callbacks
    );
  };

  const generateContextElement = async (type: keyof ProjectContext, currentContext: ProjectContext) => {
    try {
        const prompt = `
            Based on the current project context (Universe: ${currentContext.universe}, Style: ${currentContext.style}),
            Generate creative ideas for: ${type.toUpperCase()}.
            
            Specific Instructions (OUTPUT IN FRENCH):
            ${type === 'characters' ? 'Génère 3 personnages principaux détaillés. Pour chaque personnage, fournis : Nom, Apparence (physique, vêtements), Personnalité (traits, défauts), Histoire (bref passé), et Motivations. Utilise un format clair.' : ''}
            ${type === 'setting' ? 'Describe a vivid, sensory-rich setting that fits the universe.' : ''}
            ${type === 'plotPoints' ? 'Outline 3-5 key plot twists or story beats.' : ''}
            ${type === 'outline' ? 'Create a high-level chapter-by-chapter outline (Chapters 1-5).' : ''}
            ${type === 'magicSystem' ? 'Define a unique magic or technology system with rules, costs, and limitations.' : ''}
            ${type === 'factions' ? 'List 3-5 opposing factions, guilds, or groups with conflicting agendas.' : ''}
            ${type === 'history' ? 'Write a brief myth, legend, or historical event that shapes the current world.' : ''}
            ${type === 'themes' ? 'Suggest 3 major literary themes that emerge from this concept.' : ''}
            ${type === 'authors' ? 'Suggest 3-5 famous authors whose style would fit this project well.' : ''}
            ${type === 'register' ? 'Suggest a narrative register (e.g. littéraire, SFFF, thriller, romance) that fits the universe and themes. One short phrase.' : ''}
            ${type === 'pov' ? 'Suggest a point of view (e.g. 1re personne, 3e limité, 3e omniscient) that fits the story. One short phrase.' : ''}
            ${type === 'rhythm' ? 'Suggest a narrative rhythm (e.g. phrases courtes, beaucoup de dialogue, descriptions longues). One short phrase.' : ''}
            ${type === 'tone' ? 'Suggest a default tone (e.g. sombre, ironique, lyrique, neutre) that fits the story. One short phrase.' : ''}
            ${type === 'authorNotes' ? 'Suggest what to emulate from the reference authors (e.g. dialogues percutants, descriptions sensorielles, tension). One or two short sentences.' : ''}
            
            Output ONLY the content in FRENCH, no conversational filler.
        `;

        const systemInstruction = buildSystemInstruction(currentContext);
        return await engineGenerate(
          [{ role: 'user', parts: [{ text: prompt }] }],
          { systemInstruction },
          { reflect: true }
        );
    } catch (error) {
        console.error("Context Gen Error:", error);
        return null;
    }
  }

  const generateChainedContinuation = async (options: {
    recentText: string;
    chapterTitle?: string;
    chapterGoal?: string;
    approximateWords?: number;
  }) => {
    const { recentText, chapterTitle, chapterGoal, approximateWords = 500 } = options;
    const systemInstruction = getSystemInstruction();
    const chapterContext = chapterTitle
      ? `\nChapitre actuel : "${chapterTitle}"${chapterGoal ? ` — Objectif : ${chapterGoal}` : ''}.`
      : '';
    const prompt = `Le manuscrit se termine par :\n\n"${recentText.slice(-5000)}"\n\nContinue le récit de façon logique et cohérente. Génère environ ${approximateWords} mots. Ne répète pas la fin du texte. Respecte la Bible du projet et la continuité narrative.${chapterContext}\n\nRéponds UNIQUEMENT par le texte de la suite en français, sans commentaire ni métalangue.`;
    try {
      return await engineGenerateWithContinuation(
        [{ role: 'user', parts: [{ text: prompt }] }],
        { systemInstruction },
        { reflect: true }
      );
    } catch (error) {
      console.error('Chained continuation error:', error);
      return null;
    }
  };

  const suggestContinuation = async (prefixText: string, maxSentences: number = 3) => {
    const systemInstruction = getSystemInstruction();
    try {
      return await engineGenerateWithContinuation(
        [
          {
            role: 'user',
            parts: [
              {
                text: `Le manuscrit se termine actuellement par ceci (en français) :\n\n"${prefixText}"\n\nContinue naturellement le récit en ${maxSentences} phrases maximum, dans le même style et le même POV. Prose riche et évocatrice. Réponds UNIQUEMENT par le texte de la suite, sans commentaire ni métalangue. En français.`,
              },
            ],
          },
        ],
        { systemInstruction },
        { reflect: true }
      );
    } catch (error) {
      console.error('Suggest continuation error:', error);
      return null;
    }
  };

  const generateAnalysis = async (manuscriptExcerpt: string) => {
    const systemInstruction = getSystemInstruction();
    const prompt = `Tu es un lecteur expert. Analyse le passage suivant du manuscrit pour :
1. Cohérence narrative (logique, continuité, incohérences éventuelles)
2. Style et ton (rythme, registre, voix)
3. Personnages (présence, cohérence des comportements)

Sois concis et structuré. Réponds en français.

--- Passage à analyser ---\n\n${manuscriptExcerpt.slice(-8000)}`;
    try {
      return await engineGenerate([{ role: 'user', parts: [{ text: prompt }] }], { systemInstruction }, { reflect: false });
    } catch (error) {
      console.error('Analysis error:', error);
      return null;
    }
  };

  const generateDirectorInsertion = async (userCommand: string, contextForInsert: { recentText: string; chapterTitle?: string; chapterGoal?: string }) => {
    const systemInstruction = getSystemInstruction();
    const prompt = `Rédaction sur commande.

Ordre de l'auteur : "${userCommand}"

Contexte récent du manuscrit :\n"${contextForInsert.recentText.slice(-3000)}"
${contextForInsert.chapterTitle ? `\nChapitre actuel : "${contextForInsert.chapterTitle}"${contextForInsert.chapterGoal ? ` — Objectif : ${contextForInsert.chapterGoal}` : ''}` : ''}

Exécute l'ordre avec précision et une plus-value littéraire. Intègre ce nouveau passage à la suite du texte existant. Réponds UNIQUEMENT par le texte du récit en français, sans commentaire ni métalangue.`;
    try {
      return await engineGenerateWithContinuation([{ role: 'user', parts: [{ text: prompt }] }], { systemInstruction }, { reflect: true });
    } catch (error) {
      console.error('Director insertion error:', error);
      return null;
    }
  };

  const generateChapterContent = async (params: {
    chapterTitle: string;
    chapterGoal?: string;
    chapterSummary?: string;
    recentText: string;
  }) => {
    const { chapterTitle, chapterGoal, chapterSummary, recentText } = params;
    const systemInstruction = getSystemInstruction();
    const goalPart = chapterGoal ? ` Objectif : ${chapterGoal}.` : '';
    const summaryPart = chapterSummary ? ` Résumé : ${chapterSummary}.` : '';
    const prompt = `Rédige le contenu du chapitre « ${chapterTitle} ».${goalPart}${summaryPart}

Le manuscrit se termine actuellement par :

"${recentText.slice(-5000)}"

Génère le contenu de ce chapitre (plusieurs paragraphes), sans répéter la fin. Respecte la Bible du projet et la continuité narrative. Réponds UNIQUEMENT par le texte du chapitre en français.`;
    try {
      return await engineGenerateWithContinuation(
        [{ role: 'user', parts: [{ text: prompt }] }],
        { systemInstruction },
        { reflect: true }
      );
    } catch (error) {
      console.error('Chapter content generation error:', error);
      return null;
    }
  };

  const generateInsertion = async (
    type: 'description' | 'dialogue' | 'opening' | 'summary',
    contextForInsert: { recentText: string; chapterTitle?: string; chapterGoal?: string }
  ) => {
    const systemInstruction = getSystemInstruction();
    const prompts: Record<typeof type, string> = {
      description: `Contexte récent du manuscrit :\n"${contextForInsert.recentText}"\n\nGénère une courte description de lieu (atmosphère, sens, 2-4 phrases) à insérer ici. Prose riche et évocatrice. Réponds UNIQUEMENT par le texte en français, sans commentaire.`,
      dialogue: `Contexte récent du manuscrit :\n"${contextForInsert.recentText}"\n\nGénère un court échange de dialogue (2-6 répliques) qui s'insère naturellement ici. Prose riche et évocatrice. Réponds UNIQUEMENT par le dialogue en français, sans commentaire.`,
      opening: contextForInsert.chapterTitle
        ? `Génère l'ouverture du chapitre "${contextForInsert.chapterTitle}"${contextForInsert.chapterGoal ? ` (objectif : ${contextForInsert.chapterGoal})` : ''}. 2-4 phrases d'accroche. Prose riche et évocatrice. Réponds UNIQUEMENT par le texte en français.`
        : `Génère une ouverture de chapitre percutante (2-4 phrases). Prose riche et évocatrice. Réponds UNIQUEMENT par le texte en français.`,
      summary: contextForInsert.recentText
        ? `Résume le passage suivant en 2-4 phrases (pour le suivi de l'intrigue) :\n\n"${contextForInsert.recentText}"\n\nRéponds UNIQUEMENT par le résumé en français.`
        : `Aucun texte à résumer.`,
    };
    try {
      return await engineGenerate(
        [{ role: 'user', parts: [{ text: prompts[type] }] }],
        { systemInstruction },
        { reflect: true }
      );
    } catch (error) {
      console.error('Generate insertion error:', error);
      return null;
    }
  };

  const generateAutonomous = async (options: {
    type: AutonomousType;
    length: AutonomousLength;
    instructions: string;
  }): Promise<string | null> => {
    const { type, length, instructions } = options;
    if (import.meta.env?.DEV) console.log('[NovelCraft] generateAutonomous start', { type, length, instructionsLength: instructions.length });
    const typeLabel = { paragraph: 'paragraphe', dialogue: 'dialogue', chapter: 'chapitre' }[type];
    const lengthLabel = { short: 'court', medium: 'moyen', long: 'long' }[length];
    const systemInstruction = getSystemInstruction();
    const userPrompt = `Rédaction autonome.

Type : ${typeLabel}.
Longueur attendue : ${lengthLabel}.
Indications : ${instructions.trim() || '(aucune — invente en restant cohérent avec le projet)'}

En tenant compte du Monde, de l'Histoire et des Personnages du projet, génère uniquement le texte narratif en français, sans commentaire ni métalangue.`;
    try {
      const text = await engineGenerateWithContinuation(
        [{ role: 'user', parts: [{ text: userPrompt }] }],
        { systemInstruction },
        { reflect: type === 'chapter' }
      );
      if (import.meta.env?.DEV) console.log('[NovelCraft] generateAutonomous done', { textLength: text?.length ?? 0 });
      return text;
    } catch (error) {
      console.error('[NovelCraft] generateAutonomous error:', error);
      return null;
    }
  };

  const generateAutonomousStream = (
    options: { type: AutonomousType; length: AutonomousLength; instructions: string },
    callbacks: { onChunk: (chunk: string) => void; onDone: (fullText: string | null) => void; onError: (err: Error) => void }
  ) => {
    const { type, length, instructions } = options;
    if (import.meta.env?.DEV) console.log('[NovelCraft] generateAutonomousStream start', { type, length });
    const typeLabel = { paragraph: 'paragraphe', dialogue: 'dialogue', chapter: 'chapitre' }[type];
    const lengthLabel = { short: 'court', medium: 'moyen', long: 'long' }[length];
    const systemInstruction = getSystemInstruction();
    const userPrompt = `Rédaction autonome.

Type : ${typeLabel}.
Longueur attendue : ${lengthLabel}.
Indications : ${instructions.trim() || '(aucune — invente en restant cohérent avec le projet)'}

En tenant compte du Monde, de l'Histoire et des Personnages du projet, génère uniquement le texte narratif en français, sans commentaire ni métalangue.`;
    return engineGenerateStream(
      [{ role: 'user', parts: [{ text: userPrompt }] }],
      { systemInstruction },
      { reflect: type === 'chapter' },
      callbacks
    );
  };

  return {
    messages,
    sendMessage,
    isLoading,
    generateInline,
    generateInlineStream,
    generateContextElement,
    suggestContinuation,
    generateChainedContinuation,
    generateChapterContent,
    generateInsertion,
    generateDirectorInsertion,
    generateAnalysis,
    generateAutonomous,
    generateAutonomousStream,
    setMessages,
  };
};
