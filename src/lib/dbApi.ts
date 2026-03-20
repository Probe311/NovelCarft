/**
 * Client API pour la base de données locale (SQLite côté serveur).
 * En cas d'erreur réseau ou réponse non 2xx, les fonctions rejettent ou retournent null
 * pour permettre le repli IndexedDB / localStorage.
 */

export interface ApiStoredProject {
  title: string;
  content: unknown;
  context: unknown;
  updatedAt: number;
  chatHistory?: Array<{ role: "user" | "model"; text: string }>;
}

export interface ApiSettings {
  apiKeys: Record<string, string>;
  preferredProvider: string;
  engineConfig: Record<string, unknown>;
}

async function getBaseUrl(): Promise<string> {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

export async function fetchProject(): Promise<ApiStoredProject | null> {
  const base = await getBaseUrl();
  const res = await fetch(`${base}/api/project`, { method: "GET" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API project: ${res.status}`);
  const data = (await res.json()) as ApiStoredProject;
  return data;
}

export async function saveProject(project: {
  title: string;
  content: unknown;
  context: unknown;
  chatHistory?: Array<{ role: "user" | "model"; text: string }> | null;
}): Promise<void> {
  const base = await getBaseUrl();
  // #region agent log
  const bodyStr = JSON.stringify({
    title: project.title,
    content: project.content,
    context: project.context,
    chatHistory: project.chatHistory ?? null,
  });
  fetch('http://127.0.0.1:7746/ingest/522b1550-7947-4472-ac1f-7d66b7d19da1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b4fbf3'},body:JSON.stringify({sessionId:'b4fbf3',location:'dbApi.ts:saveProject',message:'saveProject payload size',data:{sizeBytes:bodyStr.length},timestamp:Date.now(),hypothesisId:'H1,H4'})}).catch(()=>{});
  // #endregion
  const res = await fetch(`${base}/api/project`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: bodyStr,
  });
  if (!res.ok) throw new Error(`API save project: ${res.status}`);
}

export async function fetchSettings(): Promise<ApiSettings | null> {
  const base = await getBaseUrl();
  const res = await fetch(`${base}/api/settings`, { method: "GET" });
  if (!res.ok) throw new Error(`API settings: ${res.status}`);
  const data = (await res.json()) as ApiSettings;
  return data;
}

export async function saveSettings(partial: {
  apiKeys?: Record<string, string>;
  preferredProvider?: string;
  engineConfig?: Record<string, unknown>;
}): Promise<void> {
  const base = await getBaseUrl();
  const res = await fetch(`${base}/api/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(partial),
  });
  if (!res.ok) throw new Error(`API save settings: ${res.status}`);
}
