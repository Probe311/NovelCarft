import { useState, useRef, useEffect, useCallback } from 'react';
import { Editor, type EditorStats } from './components/Editor';
import { ChatSidebar } from './components/ChatSidebar';
import { useEngine, ProjectContext, type AutonomousType, type AutonomousLength } from './hooks/useEngine';
import { useProjectStorage } from './hooks/useProjectStorage';
import { DEFAULT_EMPTY_CONTENT } from './lib/projectStorage';
import type { EditorContent } from './lib/projectStorage';
import { Menu, FileText, Sparkles, Loader2, ChevronDown, FileCode, FileDown, Settings, FileType, Edit3, Eye } from 'lucide-react';
import { SettingsPage } from './components/SettingsPage';
import { Editor as TiptapEditor } from '@tiptap/react';
import { exportToHtml, exportToMarkdown, exportToPdf, exportToWord } from './lib/export';
import { extractChapterTitlesFromDoc, mergeChapterInfos, getChapterRangesFromDoc } from './lib/chapterFromDoc';
import { getNarrativeContext } from './lib/contextBuilder';
import { startSettingsHydration } from './lib/apiKeysStorage';
import { toast } from 'sonner';
import {
  TEMPORARY_HIGHLIGHT_META_KEY,
  TEMPORARY_HIGHLIGHT_DURATION_MS,
} from './extensions/temporaryHighlight';

const DEFAULT_CONTEXT: ProjectContext = {
  outline: '',
  plotPoints: [],
  themes: '',
  inspiration: '',
  universe: '',
  setting: '',
  magicSystem: '',
  history: '',
  lore: '',
  factions: [],
  locations: [],
  characters: [],
  authors: [],
  referenceAuthor: '',
  style: 'Immersif, descriptif et captivant.',
  register: '',
  pov: '',
  rhythm: '',
  tone: '',
  authorNotes: '',
  chapterInfos: [],
  books: [],
  notes: '',
};

export default function App() {
  const [content, setContent] = useState<EditorContent>(DEFAULT_EMPTY_CONTENT);
  const [context, setContext] = useState<ProjectContext>(DEFAULT_CONTEXT);
  const [projectTitle, setProjectTitle] = useState('Sans titre');
  const [ready, setReady] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [selectedText, setSelectedText] = useState('');
  const editorRef = useRef<TiptapEditor | null>(null);
  const [isInlineLoading, setIsInlineLoading] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [redactionMenuOpen, setRedactionMenuOpen] = useState(false);
  const [view, setView] = useState<'editor' | 'settings'>('editor');
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const redactionMenuRef = useRef<HTMLDivElement>(null);
  const selectionRangeRef = useRef<{ from: number; to: number } | null>(null);
  const editorApiRef = useRef<{ flush: () => void } | null>(null);
  const [externalContentKey, setExternalContentKey] = useState(0);
  const [editorStats, setEditorStats] = useState<EditorStats>({ words: 0, characters: 0, cursorFrom: 0 });
  const [editorView, setEditorView] = useState<'editor' | 'preview' | 'analysis'>('editor');
  const [previewHtml, setPreviewHtml] = useState('');
  const [analysisOutput, setAnalysisOutput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const INLINE_ACTIONS: { label: string; prompt: string }[] = [
    { label: 'Réécrire', prompt: "Réécris ce texte pour qu'il soit plus descriptif et engageant." },
    { label: 'Développer', prompt: 'Développe considérablement ce texte en ajoutant des détails et de la profondeur.' },
    { label: 'Corriger', prompt: 'Corrige la grammaire et améliore la fluidité.' },
    { label: 'Raccourcir', prompt: "Raccourcis ce texte en gardant l'essentiel. Réduis la longueur d'au moins un tiers." },
    { label: 'Plus sombre', prompt: 'Réécris ce passage avec un ton plus sombre et tendu.' },
    { label: 'Plus léger', prompt: 'Réécris ce passage avec un ton plus léger ou plus optimiste.' },
    { label: 'Dialoguer', prompt: "Transforme ce texte en dialogue (répliques entre personnages). Garde le sens et l'enjeu." },
    { label: 'Décrire', prompt: 'Enrichis ce passage en ajoutant des descriptions sensorielles (lieu, atmosphère, détails).' },
  ];

  useEffect(() => {
    startSettingsHydration();
  }, []);

  useEffect(() => {
    if (!exportMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) setExportMenuOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [exportMenuOpen]);

  useEffect(() => {
    if (!redactionMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (redactionMenuRef.current && !redactionMenuRef.current.contains(e.target as Node)) setRedactionMenuOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [redactionMenuOpen]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setShowCommandPalette((v) => !v);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const storage = useProjectStorage();
  // #region agent log
  fetch('http://127.0.0.1:7746/ingest/522b1550-7947-4472-ac1f-7d66b7d19da1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'182a5d'},body:JSON.stringify({sessionId:'182a5d',location:'App.tsx:useProjectStorage',message:'after useProjectStorage',data:{keys:Object.keys(storage),typeofSaveNow:typeof (storage as { saveNow?: unknown }).saveNow,typeofSaveProject:typeof (storage as { saveProject?: unknown }).saveProject},timestamp:Date.now(),hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  const { loadProject, scheduleSave, saveProject: saveNow, lastSaved, isSaving } = storage;
  const getManuscriptText = useCallback(() => editorRef.current?.getText() ?? '', []);
  const getNarrativeContextCallback = useCallback(() => {
    const fullText = getManuscriptText();
    const { chapterStarts } = getChapterRangesFromDoc(content);
    const editor = editorRef.current;
    if (!editor) return undefined;
    const pos = editor.state.doc.textBetween(0, editor.state.selection.from).length;
    return getNarrativeContext(fullText, pos, chapterStarts);
  }, [content, getManuscriptText]);
  const {
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
  } = useEngine(context, getManuscriptText, getNarrativeContextCallback);

  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showAutonomousModal, setShowAutonomousModal] = useState(false);
  const [autonomousType, setAutonomousType] = useState<AutonomousType>('paragraph');
  const [autonomousLength, setAutonomousLength] = useState<AutonomousLength>('medium');
  const [autonomousInstructions, setAutonomousInstructions] = useState('');
  const [autonomousInsertAt, setAutonomousInsertAt] = useState<'cursor' | 'end'>('cursor');
  const [streamedText, setStreamedText] = useState('');
  const [isAutonomousLoading, setIsAutonomousLoading] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isChainedContinuation, setIsChainedContinuation] = useState(false);
  const [isCommandLoading, setIsCommandLoading] = useState(false);
  const [isDirectorLoading, setIsDirectorLoading] = useState(false);
  const [directorCommand, setDirectorCommand] = useState('');
  const [isChapterWriting, setIsChapterWriting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [chainedContinuationWords, setChainedContinuationWords] = useState(500);
  const [showProlongedPanel, setShowProlongedPanel] = useState(false);
  const [isProlongedRunning, setIsProlongedRunning] = useState(false);
  const [prolongedAddedWords, setProlongedAddedWords] = useState(0);
  const [prolongedTargetWords, setProlongedTargetWords] = useState(2000);
  const stopProlongedRef = useRef(false);

  const isGenerating = isInlineLoading || isSuggesting || isChainedContinuation || isCommandLoading || isAutonomousLoading || isDirectorLoading || isAnalyzing || isProlongedRunning || isChapterWriting;

  useEffect(() => {
    if (!isGenerating) {
      setProgress(0);
      return;
    }
    setProgress(0);
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 95) return 95;
        const remaining = 100 - prev;
        return prev + remaining * 0.1;
      });
    }, 200);
    return () => clearInterval(interval);
  }, [isGenerating]);

  useEffect(() => {
    loadProject().then((p) => {
      if (p) {
        setContent(p.content);
        const raw = (p.context || {}) as Partial<ProjectContext>;
        const characters = Array.isArray(raw.characters) && raw.characters.length > 0 && typeof (raw.characters as unknown[])[0] === 'string'
          ? (raw.characters as unknown as string[]).map((line, i) => ({ id: `mig-${Date.now()}-${i}`, name: '', role: '', description: line }))
          : (raw.characters ?? []);
        const locations = raw.locations ?? [];
        const plotPoints = Array.isArray(raw.plotPoints) && raw.plotPoints.length > 0 && typeof (raw.plotPoints as unknown[])[0] === 'string'
          ? (raw.plotPoints as unknown as string[]).map((line, i) => ({ id: `mig-${Date.now()}-${i}`, title: '', description: line, status: 'pending' as const }))
          : (raw.plotPoints ?? []);
        const books = raw.books ?? [];
        const lore = raw.lore ?? '';
        const referenceAuthor = raw.referenceAuthor ?? '';
        setContext({ ...DEFAULT_CONTEXT, ...p.context, characters, locations, plotPoints, books, lore, referenceAuthor });
        setProjectTitle(p.title || 'Sans titre');
        if (p.chatHistory?.length) setMessages(p.chatHistory);
      }
      setReady(true);
    });
  }, [loadProject, setMessages]);

  useEffect(() => {
    if (!ready) return;
    scheduleSave(content, context, projectTitle, messages);
  }, [content, context, projectTitle, messages, ready, scheduleSave]);

  // Sync chapterInfos from document H1 titles (order preserved, summary/plotGoal kept by index)
  useEffect(() => {
    if (!ready) return;
    const titles = extractChapterTitlesFromDoc(content);
    const merged = mergeChapterInfos(titles, context.chapterInfos ?? []);
    if (JSON.stringify(merged) !== JSON.stringify(context.chapterInfos ?? [])) {
      setContext((prev) => ({ ...prev, chapterInfos: merged }));
    }
  }, [content, ready, context.chapterInfos]);

  const handleUpdateContext = (key: keyof ProjectContext, value: unknown) => {
    setContext((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveNow = async () => {
    const ok = await saveNow(content, context, projectTitle, messages);
    if (ok) toast.success('Projet sauvegardé');
    else toast.error('Échec de la sauvegarde');
  };

  const titleForExport = () => projectTitle && projectTitle !== 'Sans titre' ? projectTitle : 'Mon Chapitre';

  const handleExportHtml = () => {
    const html = editorRef.current?.getHTML() ?? '';
    exportToHtml(html, titleForExport());
    setExportMenuOpen(false);
  };

  const handleExportMarkdown = () => {
    const html = editorRef.current?.getHTML() ?? '';
    exportToMarkdown(html, titleForExport());
    setExportMenuOpen(false);
  };

  const handleExportPdf = () => {
    const html = editorRef.current?.getHTML() ?? '';
    exportToPdf(html, titleForExport());
    setExportMenuOpen(false);
  };

  const handleExportWord = () => {
    const html = editorRef.current?.getHTML() ?? '';
    exportToWord(html, titleForExport());
    setExportMenuOpen(false);
  };

  const highlightInsertedRange = useCallback((from: number, to: number) => {
    const editor = editorRef.current;
    if (!editor?.view) return;
    const tr = editor.state.tr.setMeta(TEMPORARY_HIGHLIGHT_META_KEY, {
      from,
      to,
      expiresAt: Date.now() + TEMPORARY_HIGHLIGHT_DURATION_MS,
    });
    editor.view.dispatch(tr);
  }, []);

  const handleInlineAction = async (prompt: string) => {
    const editor = editorRef.current;
    if (!editor || !selectedText) return;
    editorApiRef.current?.flush();
    const stored = selectionRangeRef.current;
    const { from, to } = stored ?? editor.state.selection;
    setIsInlineLoading(true);
    let accumulated = '';
    let replaceEnd = to;
    try {
      await generateInlineStream(prompt, selectedText, {
        onChunk(chunk) {
          accumulated += chunk;
          const ed = editorRef.current;
          if (!ed) return;
          const docSize = ed.state.doc.content.size;
          const safeFrom = Math.min(from, docSize);
          const safeTo = Math.min(replaceEnd, docSize);
          ed.chain().focus().insertContentAt({ from: safeFrom, to: safeTo }, accumulated, { updateSelection: true }).run();
          replaceEnd = safeFrom + accumulated.length;
          setContent(ed.getJSON() as Record<string, unknown>);
        },
        onDone(final) {
          setIsInlineLoading(false);
          const text = (final ?? accumulated).trim();
          const ed = editorRef.current;
          if (text && ed) {
            setExternalContentKey((k) => k + 1);
            const docSize = ed.state.doc.content.size;
            const safeFrom = Math.min(from, docSize);
            highlightInsertedRange(safeFrom, safeFrom + text.length);
          } else if (!text) {
            console.warn('Inline action returned no text', { prompt });
            toast.error('Aucun résultat reçu. Réessayez ou vérifiez le moteur (Paramètres).');
          }
        },
        onError(err) {
          setIsInlineLoading(false);
          console.error('Inline action error:', err);
          toast.error(err.message || 'Erreur lors de la génération.');
        },
      });
    } catch (err) {
      setIsInlineLoading(false);
      throw err;
    }
  };

  const handleSuggestContinuation = async () => {
    const editor = editorRef.current;
    if (!editor) return;
    setIsSuggesting(true);
    const fullText = getManuscriptText();
    const prefix = fullText.length > 4000 ? fullText.slice(-4000) : fullText;
    const continuation = await suggestContinuation(prefix, 4);
    setIsSuggesting(false);
    if (continuation) {
      const from = editor.state.doc.content.size;
      editor.chain().focus().focus('end').insertContent('\n\n' + continuation.trim()).run();
      const inserted = '\n\n' + continuation.trim();
      highlightInsertedRange(from, from + inserted.length);
    }
  };

  const handleChainedContinuation = async () => {
    const editor = editorRef.current;
    if (!editor) return;
    setIsChainedContinuation(true);
    const fullText = getManuscriptText();
    const recentText = fullText.length > 5000 ? fullText.slice(-5000) : fullText;
    const narrative = getNarrativeContextCallback();
    const idx = narrative?.currentChapterIndex ?? -1;
    const ch = idx >= 0 && context.chapterInfos?.[idx] ? context.chapterInfos[idx] : undefined;
    const text = await generateChainedContinuation({
      recentText,
      chapterTitle: ch?.title,
      chapterGoal: ch?.plotGoal,
      approximateWords: chainedContinuationWords,
    });
    setIsChainedContinuation(false);
    if (text?.trim()) {
      const from = editor.state.doc.content.size;
      const toInsert = (from > 0 ? '\n\n' : '') + text.trim();
      editor.chain().focus().focus('end').insertContent(toInsert).run();
      setContent(editor.getJSON() as Record<string, unknown>);
      highlightInsertedRange(from, from + toInsert.length);
      toast.success('Suite insérée. Vous pouvez cliquer à nouveau pour continuer.');
    } else if (text !== null) {
      toast.error('Aucun texte généré. Réessayez.');
    }
  };

  const countWords = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

  const handleStartProlonged = async () => {
    const editor = editorRef.current;
    if (!editor) return;
    stopProlongedRef.current = false;
    setProlongedAddedWords(0);
    setIsProlongedRunning(true);
    const target = prolongedTargetWords;
    let addedWords = 0;
    const fullText = () => editorRef.current?.getText() ?? '';
    const getRecent = () => {
      const ft = fullText();
      return ft.length > 5000 ? ft.slice(-5000) : ft;
    };
    const narrative = getNarrativeContextCallback();
    const idx = narrative?.currentChapterIndex ?? -1;
    const ch = idx >= 0 && context.chapterInfos?.[idx] ? context.chapterInfos[idx] : undefined;
    while (!stopProlongedRef.current && addedWords < target) {
      const text = await generateChainedContinuation({
        recentText: getRecent(),
        chapterTitle: ch?.title,
        chapterGoal: ch?.plotGoal,
        approximateWords: 500,
      });
      if (!text?.trim()) break;
      const from = editor.state.doc.content.size;
      const toInsert = (from > 0 ? '\n\n' : '') + text.trim();
      editor.chain().focus().focus('end').insertContent(toInsert).run();
      setContent(editor.getJSON() as Record<string, unknown>);
      highlightInsertedRange(from, from + toInsert.length);
      const words = countWords(toInsert);
      addedWords += words;
      setProlongedAddedWords(addedWords);
    }
    setIsProlongedRunning(false);
    if (addedWords > 0) toast.success(`Rédaction prolongée terminée : ${addedWords} mots ajoutés.`);
  };

  const handleStopProlonged = () => {
    stopProlongedRef.current = true;
  };

  const handleWriteChapter = async () => {
    const editor = editorRef.current;
    if (!editor) return;
    const narrative = getNarrativeContextCallback();
    const idx = narrative?.currentChapterIndex ?? -1;
    const ch = idx >= 0 && context.chapterInfos?.[idx] ? context.chapterInfos[idx] : undefined;
    const title = ch?.title ?? 'Chapitre';
    const fullText = getManuscriptText();
    const recentText = fullText.length > 5000 ? fullText.slice(-5000) : fullText;
    setIsChapterWriting(true);
    const text = await generateChapterContent({
      chapterTitle: title,
      chapterGoal: ch?.plotGoal,
      chapterSummary: ch?.summary,
      recentText,
    });
    setIsChapterWriting(false);
    if (text?.trim()) {
      const from = editor.state.doc.content.size;
      const toInsert = (from > 0 ? '\n\n' : '') + text.trim();
      editor.chain().focus().focus('end').insertContent(toInsert).run();
      setContent(editor.getJSON() as Record<string, unknown>);
      highlightInsertedRange(from, from + toInsert.length);
      toast.success('Contenu du chapitre inséré à la fin du document.');
    } else if (text !== null) {
      toast.error('Aucun texte généré. Réessayez.');
    }
  };

  const scrollToH1 = useCallback((index: number) => {
    const el = document.getElementById('chapter-' + index);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
    }
  }, []);

  const runCommand = async (type: 'description' | 'dialogue' | 'opening' | 'summary') => {
    const editor = editorRef.current;
    if (!editor) return;
    setShowCommandPalette(false);
    setIsCommandLoading(true);
    const narrative = getNarrativeContextCallback();
    const recentText = narrative?.recentText ?? getManuscriptText().slice(-2000);
    const idx = narrative?.currentChapterIndex ?? -1;
    const ch = idx >= 0 && context.chapterInfos?.[idx] ? context.chapterInfos[idx] : undefined;
    const text = await generateInsertion(type, {
      recentText,
      chapterTitle: ch?.title,
      chapterGoal: ch?.plotGoal,
    });
    setIsCommandLoading(false);
    if (text) {
      const toInsert = text.trim();
      const from = editor.state.selection.from;
      editor.chain().focus().insertContent(toInsert).run();
      highlightInsertedRange(from, from + toInsert.length);
    }
  };

  const handleRunAnalysis = async () => {
    setIsAnalyzing(true);
    const text = getManuscriptText();
    const result = await generateAnalysis(text || '(Manuscrit vide)');
    setIsAnalyzing(false);
    setAnalysisOutput(result?.trim() ?? 'Aucun résultat.');
  };

  const handleDirectorSubmit = async () => {
    const cmd = directorCommand.trim();
    if (!cmd || !editorRef.current) return;
    setIsDirectorLoading(true);
    const narrative = getNarrativeContextCallback();
    const recentText = narrative?.recentText ?? getManuscriptText().slice(-3000);
    const idx = narrative?.currentChapterIndex ?? -1;
    const ch = idx >= 0 && context.chapterInfos?.[idx] ? context.chapterInfos[idx] : undefined;
    const text = await generateDirectorInsertion(cmd, {
      recentText,
      chapterTitle: ch?.title,
      chapterGoal: ch?.plotGoal,
    });
    setIsDirectorLoading(false);
    setDirectorCommand('');
    if (text?.trim()) {
      const editor = editorRef.current;
      const from = editor.state.selection.from;
      const toInsert = (from > 0 ? '\n\n' : '') + text.trim();
      editor.chain().focus().insertContent(toInsert).run();
      setContent(editor.getJSON() as Record<string, unknown>);
      highlightInsertedRange(from, from + toInsert.length);
      toast.success('Scène insérée.');
    } else if (text !== null) {
      toast.error('Aucun texte généré. Réessayez.');
    }
  };

  const applyAutonomousInsert = useCallback((text: string) => {
    const editor = editorRef.current;
    if (!editor?.isEditable) return false;
    const toInsert = text.trim();
    if (!toInsert) return false;
    const from =
      autonomousInsertAt === 'cursor'
        ? editor.state.selection.from
        : editor.state.doc.content.size;
    const inserted = autonomousInsertAt === 'cursor' ? toInsert : '\n\n' + toInsert;
    const chain =
      autonomousInsertAt === 'cursor'
        ? editor.chain().focus().insertContent(toInsert)
        : editor.chain().focus('end').insertContent('\n\n' + toInsert);
    const ok = chain.run();
    if (ok) {
      setContent(editor.getJSON() as Record<string, unknown>);
      highlightInsertedRange(from, from + inserted.length);
    }
    return ok;
  }, [autonomousInsertAt, highlightInsertedRange]);

  const handleAutonomousGenerate = () => {
    if (!editorRef.current) return;
    if (import.meta.env?.DEV) console.log('[NovelCraft] handleAutonomousGenerate start (streaming)', { autonomousType, autonomousLength, autonomousInsertAt });
    setIsAutonomousLoading(true);
    setStreamedText('');
    generateAutonomousStream(
      {
        type: autonomousType,
        length: autonomousLength,
        instructions: autonomousInstructions.trim(),
      },
      {
        onChunk: (chunk) => setStreamedText((prev) => prev + chunk),
        onDone: (fullText) => {
          setIsAutonomousLoading(false);
          if (fullText?.trim()) {
            if (import.meta.env?.DEV) console.log('[NovelCraft] handleAutonomousGenerate stream done', { textLength: fullText.length });
            setShowAutonomousModal(false);
            setAutonomousInstructions('');
            setStreamedText('');
            requestAnimationFrame(() => {
              const ok = applyAutonomousInsert(fullText);
              if (import.meta.env?.DEV) console.log('[NovelCraft] handleAutonomousGenerate insert', { ok });
              if (ok) toast.success('Texte inséré.');
              else toast.error('Insertion échouée. Réessayez.');
            });
          } else {
            if (import.meta.env?.DEV) console.log('[NovelCraft] handleAutonomousGenerate no text');
            toast.error('Aucun résultat. Réessayez ou vérifiez le moteur.');
          }
        },
        onError: (err) => {
          setIsAutonomousLoading(false);
          console.error('[NovelCraft] handleAutonomousGenerate stream error:', err);
          toast.error(err.message || 'Erreur lors de la génération.');
        },
      }
    );
  };

  if (view === 'settings') {
    return <SettingsPage onBack={() => setView('editor')} />;
  }

  return (
    <div className="flex h-screen bg-[#0f0f11] text-zinc-100 overflow-hidden font-sans">
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 transition-all duration-300 relative z-20">
        {/* Header */}
        <header className="h-14 border-b border-white/5 flex items-center justify-between px-4 lg:px-8 bg-[#0f0f11]/80 backdrop-blur-md relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <FileText size={18} className="text-white" />
            </div>
            <span className="font-semibold tracking-tight">NovelCraft</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative flex items-center gap-2" ref={redactionMenuRef}>
              <button
                onClick={() => setRedactionMenuOpen((o) => !o)}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 rounded-md transition-colors"
                title="Outils de rédaction"
              >
                <Sparkles size={14} />
                Rédaction
                <ChevronDown size={12} className={redactionMenuOpen ? 'rotate-180' : ''} />
              </button>
              {redactionMenuOpen && (
                <div className="absolute left-0 top-full mt-1 py-1 min-w-[200px] bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl z-50">
                  <button
                    onClick={() => { setRedactionMenuOpen(false); handleSuggestContinuation(); }}
                    disabled={isSuggesting}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                    title="Suggérer la suite du texte (fin du manuscrit)"
                  >
                    {isSuggesting ? <Loader2 size={14} className="animate-spin shrink-0" /> : <Sparkles size={14} className="shrink-0" />}
                    Suggérer la suite
                  </button>
                  <div className="px-3 py-2 border-b border-zinc-800">
                    <div className="flex items-center gap-2 mb-1.5">
                      <button
                        onClick={() => { setRedactionMenuOpen(false); handleChainedContinuation(); }}
                        disabled={isChainedContinuation}
                        className="flex items-center gap-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50 rounded px-1 -mx-1"
                        title="Enchaîner à la fin du manuscrit (répétable)"
                      >
                        {isChainedContinuation ? <Loader2 size={14} className="animate-spin shrink-0" /> : <Sparkles size={14} className="shrink-0" />}
                        Continuer l'histoire
                      </button>
                    </div>
                    <div className="flex gap-1" title="Longueur du bloc généré">
                      {([300, 500, 1000] as const).map((w) => (
                        <button
                          key={w}
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setChainedContinuationWords(w); }}
                          className={`flex-1 px-2 py-1 text-[10px] rounded transition-colors ${
                            chainedContinuationWords === w ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                          }`}
                        >
                          {w === 300 ? 'Court' : w === 500 ? 'Moyen' : 'Long'} (~{w})
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => { setRedactionMenuOpen(false); setShowAutonomousModal(true); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
                    title="Paragraphe, dialogue ou chapitre"
                  >
                    <Sparkles size={14} className="shrink-0" />
                    Rédaction autonome
                  </button>
                  <button
                    onClick={() => { setRedactionMenuOpen(false); handleWriteChapter(); }}
                    disabled={isChapterWriting}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                    title="Générer le contenu du chapitre courant (titre + résumé + objectif)"
                  >
                    {isChapterWriting ? <Loader2 size={14} className="animate-spin shrink-0" /> : <Sparkles size={14} className="shrink-0" />}
                    Rédiger ce chapitre
                  </button>
                  <button
                    onClick={() => { setRedactionMenuOpen(false); setShowProlongedPanel(true); }}
                    disabled={isProlongedRunning}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                    title="Générer jusqu'à un objectif de mots (avec arrêt possible)"
                  >
                    {isProlongedRunning ? <Loader2 size={14} className="animate-spin shrink-0" /> : <Sparkles size={14} className="shrink-0" />}
                    Rédaction autonome prolongée
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={() => setShowCommandPalette((v) => !v)}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 rounded-md transition-colors"
              title="Commandes (Ctrl+K)"
            >
              Commandes
            </button>
            <div className="flex items-center gap-2">
              {lastSaved != null && !isSaving && (
                <span className="text-xs text-zinc-500" title="Dernière sauvegarde">
                  Sauvegardé
                </span>
              )}
              {isSaving && (
                <Loader2 size={14} className="animate-spin text-zinc-500" />
              )}
              <button
                onClick={handleSaveNow}
                disabled={isSaving}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 rounded-md transition-colors disabled:opacity-50"
              >
                Sauvegarder
              </button>
            </div>
            <div className="relative flex items-center gap-2" ref={exportMenuRef}>
              <button
                onClick={() => setExportMenuOpen((o) => !o)}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 rounded-md transition-colors"
              >
                <FileDown size={14} />
                Exporter
                <ChevronDown size={12} className={exportMenuOpen ? 'rotate-180' : ''} />
              </button>
              {exportMenuOpen && (
                <div className="absolute right-0 top-full mt-1 py-1 min-w-[200px] bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl z-50">
                  <button
                    onClick={handleExportHtml}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
                  >
                    <FileCode size={14} />
                    Télécharger en HTML
                  </button>
                  <button
                    onClick={handleExportMarkdown}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
                  >
                    <FileDown size={14} />
                    Télécharger en Markdown
                  </button>
                  <button
                    onClick={handleExportPdf}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
                  >
                    <FileType size={14} />
                    Télécharger en PDF
                  </button>
                  <button
                    onClick={handleExportWord}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
                  >
                    <FileText size={14} />
                    Télécharger en Word
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={() => setView('settings')}
              className="p-2 rounded-md text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
              title="Paramètres"
            >
              <Settings size={18} />
            </button>
            <button 
              onClick={() => setShowSidebar(!showSidebar)}
              className={`p-2 rounded-md transition-colors ${showSidebar ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:bg-zinc-800'}`}
            >
              <Menu size={18} />
            </button>
          </div>
        </header>

        {/* Command palette */}
        {showCommandPalette && (
          <div
            className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-[15vh]"
            onClick={() => setShowCommandPalette(false)}
          >
            <div
              className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-md overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-2 border-b border-zinc-700 text-xs text-zinc-500">
                Ctrl+K pour fermer
              </div>
              <div className="max-h-[60vh] overflow-y-auto">
                <button
                  onClick={() => runCommand('opening')}
                  disabled={isCommandLoading}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                >
                  <FileText size={16} className="text-indigo-400" />
                  Générer l'ouverture du chapitre
                </button>
                <button
                  onClick={() => runCommand('description')}
                  disabled={isCommandLoading}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                >
                  <Sparkles size={16} className="text-indigo-400" />
                  Insérer une description de lieu
                </button>
                <button
                  onClick={() => runCommand('dialogue')}
                  disabled={isCommandLoading}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                >
                  <Sparkles size={16} className="text-indigo-400" />
                  Insérer un dialogue
                </button>
                <button
                  onClick={() => runCommand('summary')}
                  disabled={isCommandLoading}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                >
                  <FileText size={16} className="text-indigo-400" />
                  Résumer ce passage (insérer le résumé)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Rédaction autonome */}
        {showAutonomousModal && (
          <div
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
            onClick={() => !isAutonomousLoading && setShowAutonomousModal(false)}
          >
            <div
              className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b border-zinc-700 font-medium text-zinc-200">
                Rédaction autonome
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Type</label>
                  <select
                    value={autonomousType}
                    onChange={(e) => setAutonomousType(e.target.value as AutonomousType)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="paragraph">Paragraphe</option>
                    <option value="dialogue">Dialogue</option>
                    <option value="chapter">Chapitre</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Longueur attendue</label>
                  <select
                    value={autonomousLength}
                    onChange={(e) => setAutonomousLength(e.target.value as AutonomousLength)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="short">Court</option>
                    <option value="medium">Moyen</option>
                    <option value="long">Long</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Indications (optionnel)</label>
                  <textarea
                    value={autonomousInstructions}
                    onChange={(e) => setAutonomousInstructions(e.target.value)}
                    placeholder="Ex : Scène de confrontation entre X et Y dans la taverne..."
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 min-h-[80px] resize-y"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Insérer le texte</label>
                  <select
                    value={autonomousInsertAt}
                    onChange={(e) => setAutonomousInsertAt(e.target.value as 'cursor' | 'end')}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="cursor">À la position du curseur</option>
                    <option value="end">À la fin du document</option>
                  </select>
                </div>
                {(isAutonomousLoading || streamedText) && (
                  <div className="rounded-lg bg-zinc-800/80 border border-zinc-700 p-3 max-h-[200px] overflow-y-auto">
                    <div className="text-xs text-zinc-500 mb-1">Génération en direct</div>
                    <div className="text-sm text-zinc-200 whitespace-pre-wrap font-sans">{streamedText || '…'}</div>
                  </div>
                )}
              </div>
              <div className="p-4 border-t border-zinc-700 flex justify-end gap-2">
                <button
                  onClick={() => !isAutonomousLoading && setShowAutonomousModal(false)}
                  disabled={isAutonomousLoading}
                  className="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  Annuler
                </button>
                <button
                  onClick={handleAutonomousGenerate}
                  disabled={isAutonomousLoading}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {isAutonomousLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  Générer
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Rédaction autonome prolongée */}
        {showProlongedPanel && (
          <div
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
            onClick={() => {
              if (!isProlongedRunning) {
                setProlongedAddedWords(0);
                setShowProlongedPanel(false);
              }
            }}
          >
            <div
              className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b border-zinc-700 font-medium text-zinc-200">
                Rédaction autonome prolongée
              </div>
              <div className="p-4 space-y-4">
                {isProlongedRunning ? (
                  <>
                    <div className="text-sm text-zinc-300">
                      Mots ajoutés : <strong className="text-indigo-400">{prolongedAddedWords}</strong> / {prolongedTargetWords}
                    </div>
                    <button
                      type="button"
                      onClick={handleStopProlonged}
                      className="w-full px-4 py-2 text-sm font-medium bg-red-600/80 hover:bg-red-600 text-white rounded-lg transition-colors"
                    >
                      Arrêter
                    </button>
                  </>
                ) : prolongedAddedWords > 0 ? (
                  <>
                    <div className="text-sm text-zinc-300">
                      Terminé : <strong className="text-indigo-400">{prolongedAddedWords}</strong> mots ajoutés.
                    </div>
                    <button
                      type="button"
                      onClick={() => { setShowProlongedPanel(false); setProlongedAddedWords(0); }}
                      className="w-full px-4 py-2 text-sm font-medium bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-lg transition-colors"
                    >
                      Fermer
                    </button>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-xs text-zinc-500 mb-2">Objectif (mots)</label>
                      <div className="flex flex-wrap gap-2">
                        {[500, 1000, 2000, 3000].map((w) => (
                          <button
                            key={w}
                            type="button"
                            onClick={() => setProlongedTargetWords(w)}
                            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                              prolongedTargetWords === w
                                ? 'bg-indigo-600 text-white'
                                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                            }`}
                          >
                            ~{w}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleStartProlonged}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
                    >
                      <Sparkles size={16} />
                      Démarrer
                    </button>
                  </>
                )}
              </div>
              {!isProlongedRunning && prolongedAddedWords === 0 && (
                <div className="p-4 border-t border-zinc-700">
                  <button
                    type="button"
                    onClick={() => { setProlongedAddedWords(0); setShowProlongedPanel(false); }}
                    className="w-full px-4 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-200 rounded-lg transition-colors"
                  >
                    Annuler
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Editor Container — scroll sur main, TOC dans la marge à gauche de la div principale */}
        <main className="flex-1 overflow-y-auto relative flex flex-col min-h-0">
          {ready && (
            <>
              {/* Onglets Éditeur / Lecture */}
              <div className="flex items-center gap-1 px-4 pt-2 pb-2 border-b border-white/5 bg-[#0f0f11]/80">
                <button
                  type="button"
                  onClick={() => setEditorView('editor')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${editorView === 'editor' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  <Edit3 size={14} />
                  Éditeur
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditorView('preview');
                    setPreviewHtml(editorRef.current?.getHTML() ?? '');
                  }}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${editorView === 'preview' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  <Eye size={14} />
                  Lecture
                </button>
                <button
                  type="button"
                  onClick={() => setEditorView('analysis')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${editorView === 'analysis' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  <FileText size={14} />
                  Analyse
                </button>
              </div>
              <div className="flex flex-1 min-h-min w-full py-8 pl-4 sm:pl-8">
                {/* Marge gauche : table des matières */}
                <div className="shrink-0 w-52 min-w-[200px] pr-2 flex flex-col">
                  <div className="sticky top-4 z-10 flex flex-col gap-2 w-full rounded-lg bg-zinc-900/95 border border-zinc-800 mb-4 p-2" aria-label="Table des matières">
                    {(context.chapterInfos?.length ?? 0) === 0 ? (
                      <span className="text-xs text-zinc-500 px-1">Aucun chapitre (H1)</span>
                    ) : (
                      (context.chapterInfos ?? []).map((ch, idx) => (
                        <div key={`${idx}-${ch.title}`} className="rounded border border-zinc-800 bg-zinc-800/50 p-1.5 space-y-1">
                          <button
                            type="button"
                            onClick={() => scrollToH1(idx)}
                            className="text-left text-sm font-medium text-zinc-200 hover:text-white truncate w-full px-0.5 rounded transition-colors"
                          >
                            {ch.title || 'Sans titre'}
                          </button>
                          <textarea
                            value={ch.summary ?? ''}
                            onChange={(e) => {
                              const next = [...(context.chapterInfos ?? [])];
                              if (next[idx]) next[idx] = { ...next[idx], summary: e.target.value };
                              handleUpdateContext('chapterInfos', next);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            placeholder="Résumé (contexte IA)"
                            className="w-full text-xs text-zinc-400 bg-zinc-900/80 border border-zinc-700 rounded px-1.5 py-1 resize-none focus:outline-none focus:border-indigo-500/50 placeholder-zinc-600"
                            rows={2}
                          />
                        </div>
                      ))
                    )}
                  </div>
                  <div className="flex-1 min-h-[50vh]" aria-hidden />
                </div>
                {/* Contenu principal */}
                <div className="relative flex-1 min-h-min max-w-4xl mx-auto px-4 sm:px-8 w-full">
                  {editorView === 'editor' ? (
                    <Editor
                      content={content}
                      externalContentKey={externalContentKey}
                      editorApiRef={editorApiRef}
                      onChange={(c) => setContent(c)}
                      onSelectionChange={(text, range) => {
                        setSelectedText(text);
                        selectionRangeRef.current = text && range ? range : null;
                      }}
                      onStatsChange={setEditorStats}
                      onMount={(editor) => (editorRef.current = editor)}
                    />
                  ) : editorView === 'analysis' ? (
                    <div className="flex flex-col flex-1 min-h-0 p-6 space-y-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm text-zinc-400">Analyse IA du manuscrit (cohérence, style, personnages)</span>
                        <button
                          type="button"
                          onClick={handleRunAnalysis}
                          disabled={isAnalyzing}
                          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg disabled:opacity-50"
                        >
                          {isAnalyzing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                          Lancer l'analyse
                        </button>
                      </div>
                      <div className="flex-1 min-h-[200px] rounded-lg border border-zinc-700 bg-zinc-900/80 p-4 overflow-y-auto">
                        <pre className="text-sm text-zinc-300 whitespace-pre-wrap font-sans">{analysisOutput || "Cliquez sur \"Lancer l'analyse\" pour obtenir un retour sur le manuscrit."}</pre>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="prose prose-invert prose-lg max-w-none font-serif leading-loose p-8 min-h-[50vh]"
                      dangerouslySetInnerHTML={{ __html: previewHtml || '<p class="text-zinc-500">Aucun contenu. Passez en mode Éditeur pour écrire.</p>' }}
                    />
                  )}
                  {/* Director Mode : barre de commande libre */}
                  {editorView === 'editor' && (
                    <div className="absolute bottom-6 left-0 right-0 px-4 flex justify-center pointer-events-none z-20">
                      <div className="w-full max-w-3xl pointer-events-auto bg-zinc-900/95 backdrop-blur border border-zinc-700 shadow-xl rounded-xl p-2 pl-3 flex items-center gap-2 ring-1 ring-white/5 focus-within:ring-2 focus-within:ring-indigo-500/30 focus-within:border-indigo-500/50">
                        <div className="bg-indigo-500/20 text-indigo-400 p-2 rounded-lg shrink-0 hidden sm:flex">
                          <Sparkles size={18} />
                        </div>
                        <input
                          value={directorCommand}
                          onChange={(e) => setDirectorCommand(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleDirectorSubmit()}
                          placeholder="Décrivez la scène à écrire..."
                          className="flex-1 bg-transparent border-none focus:ring-0 text-zinc-200 placeholder-zinc-500 text-sm min-w-0"
                        />
                        <button
                          type="button"
                          onClick={handleDirectorSubmit}
                          disabled={!directorCommand.trim() || isDirectorLoading}
                          className="bg-indigo-600 hover:bg-indigo-500 text-white p-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                        >
                          {isDirectorLoading ? <Loader2 size={18} className="animate-spin" /> : <span className="font-medium text-sm">Écrire</span>}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Barre flottante : modifier la sélection */}
          {selectedText && (
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-zinc-900 border border-zinc-700 shadow-2xl rounded-xl px-3 py-2 flex flex-wrap items-center justify-center gap-2 max-w-[95vw] animate-in fade-in slide-in-from-bottom-4 z-50">
              {isInlineLoading ? (
                <Loader2 size={16} className="text-indigo-400 animate-spin shrink-0" />
              ) : (
                <Sparkles size={16} className="text-indigo-400 shrink-0" />
              )}
              <span className="text-sm text-zinc-300 max-w-[120px] truncate hidden sm:block shrink-0">
                {selectedText.substring(0, 18)}…
              </span>
              <div className="h-4 w-px bg-zinc-700 hidden sm:block shrink-0" />
              <button
                type="button"
                onClick={() => handleInlineAction(
                  `Réécris ce passage en adoptant strictement la plume de ${context.referenceAuthor || "l'auteur"}. Améliore le rythme, la sonorité et la fluidité. Renforce l'impact émotionnel et sensoriel ("Show, Don't Tell"). Conserve le sens mais transcende la forme. Ne commence jamais par un meta-commentaire.`
                )}
                disabled={isInlineLoading}
                className="text-xs font-medium text-indigo-300 hover:text-indigo-200 transition-colors disabled:opacity-50 shrink-0"
              >
                Réécrire
              </button>
              <button
                type="button"
                onClick={() => handleInlineAction(
                  "Enrichis ce passage : déploie les descriptions sensorielles (textures, odeurs, lumières, sons), approfondis l'intériorité des personnages (pensées, doutes, réactions), densifie l'atmosphère. Chaque ajout doit servir l'immersion ou l'intrigue. Pas de rallongement inutile."
                )}
                disabled={isInlineLoading}
                className="text-xs font-medium text-indigo-300 hover:text-indigo-200 transition-colors disabled:opacity-50 shrink-0"
              >
                Enrichir
              </button>
              <div className="h-4 w-px bg-zinc-700 hidden sm:block shrink-0" />
              {INLINE_ACTIONS.map(({ label, prompt }) => (
                <button
                  key={label}
                  onClick={() => handleInlineAction(prompt)}
                  disabled={isInlineLoading}
                  className="text-xs font-medium text-white hover:text-indigo-300 transition-colors disabled:opacity-50 shrink-0"
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Barre de progression IA */}
          {isGenerating && (
            <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2 bg-zinc-900/95 backdrop-blur border border-zinc-700 rounded-full shadow-xl">
              <span className="text-[10px] md:text-xs font-bold text-indigo-400 uppercase tracking-wider">IA en cours...</span>
              <div className="w-32 md:w-48 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 transition-[width] duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Footer statistiques */}
          <div className="sticky bottom-0 z-10 h-8 border-t border-white/5 bg-[#0f0f11]/95 flex items-center justify-between px-4 text-[10px] md:text-xs text-zinc-500 font-mono shrink-0">
            <div className="flex gap-4">
              <span>{editorStats.words} mot{editorStats.words !== 1 ? 's' : ''}</span>
              <span>~{Math.ceil(editorStats.words / 250)} pages</span>
              <span className="hidden sm:inline text-zinc-600">|</span>
              <span className="hidden sm:inline">{editorStats.characters} caractères</span>
            </div>
            <div className="hidden sm:block text-zinc-600">Curseur: {editorStats.cursorFrom}</div>
          </div>
        </main>
      </div>

      {/* Right Sidebar */}
      <div 
        className={`transition-all duration-300 ease-in-out overflow-hidden border-l border-white/5 ${
          showSidebar ? 'w-80 lg:w-96 translate-x-0' : 'w-0 translate-x-full opacity-0'
        }`}
      >
        <ChatSidebar 
          messages={messages} 
          onSendMessage={sendMessage} 
          isLoading={isLoading}
          context={context}
          onUpdateContext={handleUpdateContext}
          onGenerateContextElement={generateContextElement}
        />
      </div>
    </div>
  );
}
