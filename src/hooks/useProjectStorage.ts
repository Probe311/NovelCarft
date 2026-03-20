import { useState, useCallback, useRef } from 'react';
import type { ProjectContext } from './useEngine';
import {
  loadProject as loadProjectFromDB,
  saveProject as saveProjectToDB,
  type StoredProject,
  type EditorContent,
} from '../lib/projectStorage';

const SAVE_DEBOUNCE_MS = 2000;

export function useProjectStorage() {
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadProject = useCallback(async (): Promise<StoredProject | null> => {
    return loadProjectFromDB();
  }, []);

  const saveProject = useCallback(
    async (project: {
      content: EditorContent;
      context: ProjectContext;
      title?: string;
      chatHistory?: Array<{ role: 'user' | 'model'; text: string }>;
    }): Promise<boolean> => {
      setIsSaving(true);
      try {
        const MAX_CHAT_HISTORY = 50;
        const chatHistory =
          (project.chatHistory?.length ?? 0) > MAX_CHAT_HISTORY
            ? project.chatHistory!.slice(-MAX_CHAT_HISTORY)
            : project.chatHistory;
        await saveProjectToDB({
          content: project.content,
          context: project.context,
          title: project.title ?? 'Sans titre',
          updatedAt: Date.now(),
          chatHistory,
        });
        setLastSaved(Date.now());
        return true;
      } catch (e) {
        console.error('Save failed:', e);
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    []
  );

  const scheduleSave = useCallback(
    (
      content: EditorContent,
      context: ProjectContext,
      title?: string,
      chatHistory?: Array<{ role: 'user' | 'model'; text: string }>
    ) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        saveProject({ content, context, title, chatHistory });
      }, SAVE_DEBOUNCE_MS);
    },
    [saveProject]
  );

  const saveNow = useCallback(
    (
      content: EditorContent,
      context: ProjectContext,
      title?: string,
      chatHistory?: Array<{ role: 'user' | 'model'; text: string }>
    ) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      return saveProject({ content, context, title, chatHistory });
    },
    [saveProject]
  );

  // #region agent log
  const ret = { loadProject, saveProject: saveNow, scheduleSave, lastSaved, isSaving };
  fetch('http://127.0.0.1:7746/ingest/522b1550-7947-4472-ac1f-7d66b7d19da1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'182a5d'},body:JSON.stringify({sessionId:'182a5d',location:'useProjectStorage.ts:return',message:'hook return keys and types',data:{keys:Object.keys(ret),hasSaveNow:'saveNow' in ret,hasSaveProject:'saveProject' in ret,typeSaveProject:typeof (ret as { saveProject?: unknown }).saveProject},timestamp:Date.now(),hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  return ret;
}
