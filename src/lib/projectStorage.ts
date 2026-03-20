import type { ProjectContext } from '../hooks/useEngine';
import { fetchProject as fetchProjectFromApi, saveProject as saveProjectToApi } from './dbApi';

const DB_NAME = 'novelcraft';
const STORE_NAME = 'projects';
const PROJECT_KEY = 'novelcraft_project';

export type EditorContent = Record<string, unknown> | string;

export const DEFAULT_EMPTY_CONTENT: EditorContent = { type: 'doc', content: [] };

export interface StoredProject {
  content: EditorContent;
  context: ProjectContext;
  title: string;
  updatedAt: number;
  /** Derniers messages du chat (limité pour la taille). */
  chatHistory?: Array<{ role: 'user' | 'model'; text: string }>;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

function loadProjectFromIndexedDB(): Promise<StoredProject | null> {
  return new Promise((resolve, reject) => {
    openDB()
      .then((db) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(PROJECT_KEY);
        req.onerror = () => {
          db.close();
          reject(req.error);
        };
        req.onsuccess = () => {
          db.close();
          resolve((req.result as StoredProject) || null);
        };
      })
      .catch(reject);
  });
}

export async function loadProject(): Promise<StoredProject | null> {
  try {
    const apiProject = await fetchProjectFromApi();
    if (apiProject == null) return loadProjectFromIndexedDB();
    return {
      title: apiProject.title,
      content: apiProject.content as EditorContent,
      context: apiProject.context as ProjectContext,
      updatedAt: apiProject.updatedAt,
      chatHistory: apiProject.chatHistory,
    };
  } catch {
    return loadProjectFromIndexedDB();
  }
}

export async function saveProject(project: StoredProject): Promise<void> {
  try {
    await saveProjectToApi({
      title: project.title,
      content: project.content,
      context: project.context,
      chatHistory: project.chatHistory ?? null,
    });
    return;
  } catch {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const payload: StoredProject = {
        ...project,
        updatedAt: Date.now(),
        chatHistory: project.chatHistory,
      };
      const req = tx.objectStore(STORE_NAME).put(payload, PROJECT_KEY);
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
      req.onsuccess = () => {
        db.close();
        resolve();
      };
    });
  }
}
