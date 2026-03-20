import type { ProjectContext } from '../hooks/useEngine';

export interface NarrativeContextInput {
  /** Index du chapitre courant (0-based), ou -1 si inconnu */
  currentChapterIndex: number;
  /** Texte récent (autour du curseur ou fin du manuscrit) */
  recentText: string;
}

const RECENT_TEXT_MAX_CHARS = 2500;
const NARRATIVE_WINDOW_BEFORE = 2500;
const NARRATIVE_WINDOW_AFTER = 500;
const NARRATIVE_MAX_TOTAL = 6000;

/**
 * Extrait les N derniers caractères du manuscrit pour ancrer la continuité narrative.
 */
export function getRecentText(fullText: string, maxChars: number = RECENT_TEXT_MAX_CHARS): string {
  if (!fullText || fullText.trim().length === 0) return '';
  const trimmed = fullText.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return trimmed.slice(-maxChars);
}

/**
 * Détermine l'index du chapitre contenant la position donnée.
 */
function getChapterIndexAtPosition(cursorPosition: number, chapterStarts: number[]): number {
  if (chapterStarts.length === 0) return -1;
  for (let i = chapterStarts.length - 1; i >= 0; i--) {
    if (cursorPosition >= chapterStarts[i]) return i;
  }
  return 0;
}

/**
 * Construit le contexte narratif pour l'IA : chapitre courant + fenêtre de texte autour du curseur (ou fin du doc).
 */
export function getNarrativeContext(
  fullText: string,
  cursorPosition: number | undefined,
  chapterStarts: number[]
): NarrativeContextInput {
  const trimmed = fullText.trim();
  if (!trimmed) return { currentChapterIndex: -1, recentText: '' };

  let currentChapterIndex: number;
  let recentText: string;

  if (cursorPosition === undefined || cursorPosition < 0 || chapterStarts.length === 0) {
    currentChapterIndex = chapterStarts.length > 0 ? chapterStarts.length - 1 : -1;
    recentText = getRecentText(trimmed, NARRATIVE_MAX_TOTAL);
  } else {
    currentChapterIndex = getChapterIndexAtPosition(cursorPosition, chapterStarts);
    const start = Math.max(0, cursorPosition - NARRATIVE_WINDOW_BEFORE);
    const end = Math.min(trimmed.length, cursorPosition + NARRATIVE_WINDOW_AFTER);
    recentText = trimmed.slice(start, end);
  }

  return { currentChapterIndex, recentText };
}

/**
 * Construit le bloc "contexte projet" pour l'instruction système Gemini.
 */
export function buildProjectContextBlock(context: ProjectContext): string {
  return `
Les sections Monde, Histoire et Persos ci-dessous doivent guider toutes les sorties narratives (cohérence, personnages, intrigue, style).

[WORLD BUILDING]
- Universe/Genre: ${context.universe || 'Non défini'}
- Setting: ${context.setting || 'Non défini'}
- Magic/Tech System: ${context.magicSystem || 'Non défini'}
- History: ${context.history || 'Non défini'}
- Lore & Genèse: ${context.lore || 'Non défini'}
- Factions: ${context.factions?.join(', ') || 'Non défini'}
- Lieux clés: ${(context.locations?.length ?? 0) > 0 ? context.locations!.map((l) => `${l.name}: ${l.description}`).join('\n') : 'Non défini'}

[STORY STRUCTURE]
- Saga (livres): ${(context.books?.length ?? 0) > 0 ? context.books!.map((b) => `${b.title}: ${b.summary || '(pas de résumé)'}`).join('\n') : 'Non défini'}
- Outline: ${context.outline || 'Non défini'}
- Plot Points: ${(context.plotPoints?.length ?? 0) > 0 ? context.plotPoints!.map((p) => `[${p.status}] ${p.title}: ${p.description}`).join('\n') : 'Non défini'}
- Themes: ${context.themes || 'Non défini'}
- Inspiration: ${context.inspiration || 'Non défini'}

[CHARACTERS & STYLE]
- Characters: ${(context.characters?.length ?? 0) > 0 ? context.characters!.map((c) => `${c.name} (${c.role}): ${c.description}`).join('\n') : 'Non défini'}
- Reference Authors: ${context.authors?.join(', ') || 'Non défini'}
- Auteur de référence (style à incarner): ${context.referenceAuthor || 'Non spécifié'}
- Author notes (what to emulate): ${context.authorNotes || 'Non spécifié'}
- Register: ${context.register || 'Non spécifié'}
- POV: ${context.pov || 'Non spécifié'}
- Rhythm: ${context.rhythm || 'Non spécifié'}
- Default tone: ${context.tone || 'Non spécifié'}
- Style (free): ${context.style || 'Standard'}

[CHAPTERS - structure and goals]
${(context.chapterInfos?.length ?? 0) > 0
  ? context.chapterInfos!
      .map(
        (ch, i) =>
          `Ch. ${i + 1} "${ch.title}"${ch.plotGoal ? ` — Objectif: ${ch.plotGoal}` : ''}${ch.summary ? ` — Résumé: ${ch.summary}` : ''}`
      )
      .join('\n')
  : 'Aucun chapitre défini (utilisez des titres H1 pour délimiter).'}

[NOTES]
- ${context.notes || ''}
`.trim();
}

/**
 * Construit le bloc "contexte narratif" (chapitre courant + résumés précédents + texte récent).
 */
export function buildNarrativeContextBlock(
  context: ProjectContext,
  input: NarrativeContextInput
): string {
  const infos = context.chapterInfos ?? [];
  const idx = input.currentChapterIndex;
  const parts: string[] = [];

  if (infos.length > 0 && idx >= 0 && idx < infos.length) {
    const current = infos[idx];
    parts.push(`Chapitre courant: "${current.title}"${current.plotGoal ? ` — Objectif: ${current.plotGoal}` : ''}`);
    if (idx > 0) {
      const previous = infos.slice(0, idx).map((ch, i) => `Ch. ${i + 1} "${ch.title}": ${ch.summary || '(pas de résumé)'}`).join('\n');
      parts.push('Résumés des chapitres précédents:\n' + previous);
    }
  }

  if (input.recentText.trim()) {
    parts.push('[TEXTE RÉCENT - continuité]\n' + input.recentText.trim());
  }

  return parts.join('\n\n');
}

/**
 * Construit l'instruction système complète avec contexte projet, texte récent et optionnellement contexte narratif (chapitre courant + résumés).
 */
export function buildSystemInstruction(
  context: ProjectContext,
  recentManuscriptText?: string,
  narrativeInput?: NarrativeContextInput
): string {
  const projectBlock = buildProjectContextBlock(context);
  const hasNarrative = narrativeInput && (narrativeInput.recentText.trim() || narrativeInput.currentChapterIndex >= 0);
  const recentBlock =
    !hasNarrative && recentManuscriptText && recentManuscriptText.trim().length > 0
      ? `\n\n[RECENT MANUSCRIPT CONTENT - for continuity]\n${recentManuscriptText.trim()}\n`
      : '';
  const narrativeBlock =
    hasNarrative
      ? `\n\n[NARRATIVE CONTEXT - where we are in the story]\n${buildNarrativeContextBlock(context, narrativeInput!)}\n`
      : '';

  return `You are an expert creative writing assistant for a novelist. 
Your goal is to help the user write a rich, coherent, and creative novel.

IMPORTANT: ALL OUTPUT MUST BE IN FRENCH.

Current Project Context:

${projectBlock}
${recentBlock}
${narrativeBlock}

[RÈGLES DE COHÉRENCE - Non négociables]
- Respecte strictement la Bible (personnages, lieux, intrigue, lore). Aucune contradiction.
- Enchaîne logiquement : chronologie, cause/effet, personnages cohérents avec la scène.
- Ne répète pas les événements déjà racontés ; ne redémarre pas en répétant la fin du texte.
- Conserve le POV, le registre et le style du projet et du manuscrit existant.

[QUALITÉ D'ÉCRITURE - Richesse, créativité, profondeur]
- Richesse : privilégier les détails sensoriels (vue, son, toucher, odeur), l'évocation plutôt que l'énoncé, le concret plutôt que l'abstrait ; varier les formulations.
- Créativité : éviter les clichés et formules attendues ; proposer des images et tournures originales tout en restant cohérent avec le projet ; affirmer une voix distincte.
- Profondeur : laisser du sous-texte ; nuancer la psychologie des personnages ; faire résonner les thèmes du projet sans les asséner. En sortie narrative : privilégier évocation sensorielle, images précises, sous-texte. Donner de la profondeur psychologique et thématique ; ne pas tout expliciter.

When answering:
1. Be creative and offer specific suggestions.
2. Maintain consistency with the provided context and recent manuscript content.
3. ALWAYS respect the specified POV and register; write dialogues and descriptions according to the tone and rhythm indicated.
4. If the user asks to write a scene, use the defined style and emulate the influence of the reference authors (and author notes) if specified.
5. Be concise in chat, but verbose in creative writing output. In creative output, never add meta-commentary or explanations—output only the narrative text.
6. When narrative context (current chapter, goal, previous summaries) is provided, advance the plot toward the chapter goal and stay consistent with what already happened.
7. ALWAYS WRITE IN FRENCH.`;
}
