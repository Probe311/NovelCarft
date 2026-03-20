import type { EditorContent } from './projectStorage';

export interface ChapterInfo {
  title: string;
  summary?: string;
  plotGoal?: string;
}

export interface ChapterRange {
  title: string;
  startOffset: number;
  endOffset: number;
}

type DocNode = { type: string; content?: DocNode[]; attrs?: { level?: number }; text?: string };

/**
 * Extrait le texte d'un nœud (heading, paragraph, etc.) en parcourant récursivement.
 */
function getNodeText(node: DocNode): string {
  if (node.text) return node.text;
  if (!node.content || !Array.isArray(node.content)) return '';
  return node.content.map(getNodeText).join('');
}

/**
 * Construit le texte brut du document et les offsets de début de chaque chapitre (H1).
 * Les blocs de premier niveau sont concaténés avec un saut de ligne (comme getText() TipTap).
 */
export function getChapterRangesFromDoc(content: EditorContent): { text: string; chapterStarts: number[] } {
  const chapterStarts: number[] = [];
  let text = '';
  if (!content || typeof content !== 'object' || (content as Record<string, unknown>).type !== 'doc') {
    return { text: '', chapterStarts };
  }
  const doc = content as { content?: DocNode[] };
  const nodes = doc.content;
  if (!Array.isArray(nodes)) return { text: '', chapterStarts };

  for (const node of nodes) {
    if (node.type === 'heading' && node.attrs?.level === 1) {
      chapterStarts.push(text.length);
    }
    const nodeText = getNodeText(node);
    text += nodeText + '\n';
  }
  return { text, chapterStarts };
}

/**
 * Parcourt le document TipTap (JSON) et retourne la liste des titres de niveau 1 (chapitres) dans l'ordre.
 */
export function extractChapterTitlesFromDoc(content: EditorContent): string[] {
  const titles: string[] = [];
  if (!content || typeof content !== 'object' || (content as Record<string, unknown>).type !== 'doc') {
    return titles;
  }
  const doc = content as { content?: DocNode[] };
  const nodes = doc.content;
  if (!Array.isArray(nodes)) return titles;

  function walk(nodes: DocNode[]) {
    for (const node of nodes) {
      if (node.type === 'heading' && node.attrs?.level === 1) {
        titles.push(getNodeText(node).trim() || 'Sans titre');
      }
      if (node.content && Array.isArray(node.content)) {
        walk(node.content);
      }
    }
  }
  walk(nodes);
  return titles;
}

/**
 * Synthèse : à partir des titres extraits du doc et de l'ancienne liste chapterInfos,
 * produit une nouvelle liste ChapterInfo (même ordre que les H1, résumés/objectifs conservés par index).
 */
export function mergeChapterInfos(
  titlesFromDoc: string[],
  existingInfos: ChapterInfo[]
): ChapterInfo[] {
  return titlesFromDoc.map((title, index) => {
    const existing = existingInfos[index];
    if (existing && existing.title === title) {
      return { ...existing, title };
    }
    if (existing) {
      return { title, summary: existing.summary, plotGoal: existing.plotGoal };
    }
    return { title };
  });
}
