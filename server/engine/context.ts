/**
 * Gestion du contexte moteur : compaction (résumé) et réflexion (planification).
 * Partagé par le moteur v1 et v1.1.
 */

export type Message = { role: string; content: string };

/** Seuil (caractères) au-delà duquel le contexte est compacté par résumé. */
export const COMPACTION_THRESHOLD_CHARS = 14_000;
/** Seuil (caractères) au-delà duquel une phase de réflexion (planification) est déclenchée. */
export const REFLECTION_THRESHOLD_CHARS = 8_000;
/** Nombre de caractères conservés pour la continuité après compaction. */
export const RECENT_EXCERPT_CHARS = 3_000;
/** Taille maximale du contexte envoyé au modèle de résumé. */
export const SUMMARIZE_INPUT_MAX_CHARS = 12_000;

export function toMessages(
  contents: Array<{ role: string; parts: Array<{ text: string }> }>,
  systemInstruction?: string
): Message[] {
  const messages: Message[] = contents.map((c) => ({
    role: c.role as "user" | "assistant" | "system",
    content: c.parts.map((p) => p.text).join("\n"),
  }));
  if (systemInstruction?.trim()) {
    messages.unshift({ role: "system", content: systemInstruction.trim() });
  }
  return messages;
}

export function getContextLength(messages: Message[]): number {
  return messages.reduce((sum, m) => sum + (m.content?.length ?? 0), 0);
}

export type GenerateFn = (messages: Message[]) => Promise<string | null>;

/**
 * Phase de réflexion (planification) : produit un court plan (ton, enjeux, POV) pour guider la génération.
 */
export async function runReflection(
  messages: Message[],
  generate: GenerateFn
): Promise<string | null> {
  const contextBlock = messages.map((m) => `[${m.role}]\n${m.content}`).join("\n\n");
  const prompt = `Étant donné le contexte projet et la demande ci-dessous, liste en 3 à 5 points très courts : ton à adopter, enjeux de la scène ou du passage, et ce qui doit être respecté (POV, continuité, style). Réponds UNIQUEMENT par cette liste, en français. Pas de métalangue.

${contextBlock}`;

  return generate([{ role: "user", content: prompt }]);
}

/**
 * Compacte un contexte long en le remplaçant par un résumé + extrait récent (self-summarization).
 */
export async function compactContext(
  messages: Message[],
  generate: GenerateFn
): Promise<Message[]> {
  const fullText = messages.map((m) => m.content).join("\n\n");
  const contextToSummarize = fullText.slice(0, SUMMARIZE_INPUT_MAX_CHARS);
  const recentExcerpt = fullText.slice(-RECENT_EXCERPT_CHARS);

  const summarizerPrompt = `Tu es un assistant. Résume l'état du projet et du récit pour la suite : où en est l'histoire, qui est en jeu, quel est l'enjeu immédiat. Maximum 1500 caractères.

Contexte à résumer :
${contextToSummarize}

Réponds UNIQUEMENT par le résumé en français.`;

  const summary = await generate([{ role: "user", content: summarizerPrompt }]);
  if (!summary?.trim()) return messages;

  const compactedSystem =
    summary.trim() + "\n\n[TEXTE RÉCENT - continuité]\n" + recentExcerpt;
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const lastUserContent = lastUser?.content ?? messages[messages.length - 1]?.content ?? "";

  return [
    { role: "system", content: compactedSystem },
    { role: "user", content: lastUserContent },
  ];
}
