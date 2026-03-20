import { useState, useEffect, useRef, useCallback, memo, type MutableRefObject } from 'react';
import { useEditor, EditorContent, Editor as TiptapEditor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Typography from '@tiptap/extension-typography';
import { HeadingAnchors } from '../extensions/headingAnchors';
import { TemporaryHighlight } from '../extensions/temporaryHighlight';
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Quote,
  Heading1,
  Heading2,
  Heading3,
  Undo2,
  Redo2,
} from 'lucide-react';
import type { EditorContent as EditorContentType } from '../lib/projectStorage';
import { cn } from '../lib/utils';

/** Debounce avec annulation et flush immédiat. flushNow(getValue) annule le timer et appelle fn(getValue()). */
function useDebounceWithFlush<T>(
  fn: (value: T) => void,
  ms: number
): [ (value: T) => void, (getValue: () => T) => void ] {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastValueRef = useRef<T | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const schedule = useCallback((value: T) => {
    lastValueRef.current = value;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      fnRef.current(lastValueRef.current as T);
    }, ms);
  }, [ms]);
  const flushNow = useCallback((getValue: () => T) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    fnRef.current(getValue());
  }, []);
  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, [ms]);
  return [schedule, flushNow];
}

/** Throttle: appelle fn au plus une fois toutes les ms. */
function useThrottle<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  const last = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  return useRef(((...args: unknown[]) => {
    const now = Date.now();
    if (now - last.current >= ms) { last.current = now; fnRef.current(...args); }
  }) as T).current;
}

type DocContent = { type: 'doc'; content?: unknown[] };

const EMPTY_DOC: DocContent = { type: 'doc', content: [] };

function normalizeContent(content: EditorContentType): DocContent {
  if (content === null || content === undefined) return EMPTY_DOC;
  if (typeof content === 'string') {
    if (content.trim() === '') return EMPTY_DOC;
    return {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: content }] }],
    } as DocContent;
  }
  if (typeof content === 'object' && content !== null && 'type' in content) {
    return content as DocContent;
  }
  return EMPTY_DOC;
}

const activeToolbarClass =
  '!text-indigo-300 !bg-indigo-500/25 ring-1 ring-indigo-400/50';

const ToolbarButtons = memo(function ToolbarButtons({ editor, editorUpdateKey }: { editor: TiptapEditor; editorUpdateKey: number }) {
  const toolbarClass =
    'p-2 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors disabled:opacity-40 disabled:pointer-events-none';
  return (
    <>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={cn(toolbarClass, editor.isActive('bold') && activeToolbarClass)}
        title="Gras (Ctrl+B)"
      >
        <Bold size={16} className={cn(editor.isActive('bold') && 'font-bold')} />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={cn(toolbarClass, editor.isActive('italic') && activeToolbarClass)}
        title="Italique (Ctrl+I)"
      >
        <Italic size={16} className={cn(editor.isActive('italic') && 'italic')} />
      </button>
      <span className="w-px h-5 bg-zinc-600 mx-0.5" aria-hidden />
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        className={cn(toolbarClass, editor.isActive('heading', { level: 1 }) && activeToolbarClass)}
        title="Titre 1"
      >
        <Heading1 size={16} />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={cn(toolbarClass, editor.isActive('heading', { level: 2 }) && activeToolbarClass)}
        title="Titre 2"
      >
        <Heading2 size={16} />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        className={cn(toolbarClass, editor.isActive('heading', { level: 3 }) && activeToolbarClass)}
        title="Titre 3"
      >
        <Heading3 size={16} />
      </button>
      <span className="w-px h-5 bg-zinc-600 mx-0.5" aria-hidden />
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={cn(toolbarClass, editor.isActive('bulletList') && activeToolbarClass)}
        title="Liste à puces"
      >
        <List size={16} />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={cn(toolbarClass, editor.isActive('orderedList') && activeToolbarClass)}
        title="Liste numérotée"
      >
        <ListOrdered size={16} />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        className={cn(toolbarClass, editor.isActive('blockquote') && activeToolbarClass)}
        title="Citation"
      >
        <Quote size={16} />
      </button>
      <span className="w-px h-5 bg-zinc-600 mx-0.5" aria-hidden />
      <button
        type="button"
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        className={toolbarClass}
        title="Annuler (Ctrl+Z)"
      >
        <Undo2 size={16} />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        className={toolbarClass}
        title="Rétablir (Ctrl+Shift+Z)"
      >
        <Redo2 size={16} />
      </button>
    </>
  );
});

const WORD_COUNT_THROTTLE_MS = 400;

function WordCount({ editor }: { editor: TiptapEditor }) {
  const [count, setCount] = useState(0);
  const lastUpdate = useRef(0);
  useEffect(() => {
    if (!editor) return;
    const update = () => {
      const now = Date.now();
      if (now - lastUpdate.current < WORD_COUNT_THROTTLE_MS) return;
      lastUpdate.current = now;
      const text = editor.getText();
      const n = text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0;
      setCount(n);
    };
    update();
    editor.on('transaction', update);
    return () => editor.off('transaction', update);
  }, [editor]);
  return (
    <span className="ml-auto text-xs text-zinc-500 tabular-nums" aria-live="polite">
      {count} mot{count !== 1 ? 's' : ''}
    </span>
  );
}

const EditorStatusBar = memo(function EditorStatusBar({ editor, editorUpdateKey }: { editor: TiptapEditor; editorUpdateKey: number }) {
  const active: string[] = [];
  if (editor.isActive('bold')) active.push('Gras');
  if (editor.isActive('italic')) active.push('Italique');
  if (editor.isActive('heading', { level: 1 })) active.push('Titre 1');
  if (editor.isActive('heading', { level: 2 })) active.push('Titre 2');
  if (editor.isActive('heading', { level: 3 })) active.push('Titre 3');
  if (editor.isActive('bulletList')) active.push('Liste à puces');
  if (editor.isActive('orderedList')) active.push('Liste numérotée');
  if (editor.isActive('blockquote')) active.push('Citation');

  return (
    <div
      className="sticky bottom-0 z-10 flex items-center gap-2 px-3 py-2 mt-2 text-xs rounded-lg bg-zinc-900/95 border border-zinc-800 text-zinc-400"
      role="status"
      aria-live="polite"
    >
      <span className="text-zinc-500 shrink-0">Format actif :</span>
      {active.length > 0 ? (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {active.map((label) => (
            <span
              key={label}
              className="inline-flex items-center px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-400/40 font-medium"
            >
              {label}
            </span>
          ))}
        </span>
      ) : (
        <span className="text-zinc-500 italic">Aucun format de caractère ou de bloc actif</span>
      )}
    </div>
  );
});

export interface EditorStats {
  words: number;
  characters: number;
  cursorFrom: number;
}

interface EditorProps {
  content: EditorContentType;
  /** Incrémenté par le parent après une mise à jour externe (ex. action inline) pour forcer la synchro du contenu dans l’éditeur. */
  externalContentKey?: number;
  onChange: (content: Record<string, unknown>) => void;
  onSelectionChange?: (text: string, range?: { from: number; to: number }) => void;
  /** Appelé à chaque changement de contenu ou de sélection pour le footer (mots, caractères, curseur). */
  onStatsChange?: (stats: EditorStats) => void;
  onMount?: (editor: TiptapEditor) => void;
  /** Ref remplie avec { flush } pour forcer le flush du debounce onChange (ex. avant une action inline). */
  editorApiRef?: MutableRefObject<{ flush: () => void } | null>;
}

const ONCHANGE_DEBOUNCE_MS = 350;
const SET_UPDATE_THROTTLE_MS = 180;
const SELECTION_THROTTLE_MS = 120;

const STATS_THROTTLE_MS = 150;

export function Editor({ content, externalContentKey = 0, onChange, onSelectionChange, onStatsChange, onMount, editorApiRef }: EditorProps) {
  const initialContent = normalizeContent(content);
  const [editorUpdateKey, setEditorUpdateKey] = useState(0);
  const lastSetUpdate = useRef(0);
  const editorInstanceRef = useRef<TiptapEditor | null>(null);

  const [scheduleOnChange, flushOnChange] = useDebounceWithFlush<Record<string, unknown>>(onChange, ONCHANGE_DEBOUNCE_MS);
  const notifySelection = useThrottle((text: string, range?: { from: number; to: number }) => {
    onSelectionChange?.(text, range);
  }, SELECTION_THROTTLE_MS);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Typography,
      Placeholder.configure({
        placeholder: 'Commencez à écrire votre chef-d\'œuvre...',
      }),
      HeadingAnchors,
      TemporaryHighlight,
    ],
    content: initialContent,
    onUpdate: ({ editor: ed }) => {
      editorInstanceRef.current = ed;
      const json = ed.getJSON() as Record<string, unknown>;
      scheduleOnChange(json);
      const now = Date.now();
      if (now - lastSetUpdate.current >= SET_UPDATE_THROTTLE_MS) {
        lastSetUpdate.current = now;
        setEditorUpdateKey((n) => n + 1);
      }
    },
    onSelectionUpdate: ({ editor: ed }) => {
      editorInstanceRef.current = ed;
      const selection = ed.state.selection;
      const text = ed.state.doc.textBetween(selection.from, selection.to, ' ');
      const range = text ? { from: selection.from, to: selection.to } : undefined;
      notifySelection(text, range);
      const now = Date.now();
      if (now - lastSetUpdate.current >= SET_UPDATE_THROTTLE_MS) {
        lastSetUpdate.current = now;
        setEditorUpdateKey((n) => n + 1);
      }
    },
    onCreate: ({ editor: ed }) => {
      editorInstanceRef.current = ed;
      if (onMount) onMount(ed);
    },
    editorProps: {
      attributes: {
        class: 'prose prose-invert max-w-none focus:outline-none min-h-[calc(100vh-200px)]',
      },
    },
  });

  // Flush du debounce au blur et au démontage pour ne pas perdre de contenu
  useEffect(() => {
    if (!editor) return;
    const flush = () => {
      const ed = editorInstanceRef.current ?? editor;
      flushOnChange(() => ed.getJSON() as Record<string, unknown>);
    };
    editor.on('blur', flush);
    return () => {
      editor.off('blur', flush);
      flush();
    };
  }, [editor, flushOnChange]);

  // Expose flush du debounce au parent (ex. pour action inline)
  useEffect(() => {
    if (!editor || !editorApiRef) return;
    editorApiRef.current = {
      flush: () => {
        const ed = editorInstanceRef.current ?? editor;
        flushOnChange(() => ed.getJSON() as Record<string, unknown>);
      },
    };
    return () => {
      editorApiRef.current = null;
    };
  }, [editor, editorApiRef, flushOnChange]);

  const lastStatsUpdate = useRef(0);
  useEffect(() => {
    if (!editor || !onStatsChange) return;
    const update = () => {
      const now = Date.now();
      if (now - lastStatsUpdate.current < STATS_THROTTLE_MS) return;
      lastStatsUpdate.current = now;
      const text = editor.getText();
      const words = text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0;
      const characters = text.length;
      const cursorFrom = editor.state.selection.from;
      onStatsChange({ words, characters, cursorFrom });
    };
    update();
    editor.on('transaction', update);
    editor.on('selectionUpdate', update);
    return () => {
      editor.off('transaction', update);
      editor.off('selectionUpdate', update);
    };
  }, [editor, onStatsChange]);

  // Synchro du contenu parent → éditeur lors d’une mise à jour externe (ex. action inline Développer)
  const prevExternalContentKeyRef = useRef(0);
  useEffect(() => {
    if (!editor || externalContentKey === 0) return;
    if (prevExternalContentKeyRef.current === externalContentKey) return;
    prevExternalContentKeyRef.current = externalContentKey;
    const nextContent = normalizeContent(content);
    editor.commands.setContent(nextContent, { emitUpdate: false });
  }, [editor, externalContentKey, content]);

  if (!editor) {
    return null;
  }

  return (
    <div className="relative w-full max-w-3xl mx-auto mt-8 px-8">
      <div className="sticky top-4 z-10 flex items-center gap-0.5 p-2 rounded-lg bg-zinc-900/95 border border-zinc-800 mb-4">
        <ToolbarButtons editor={editor} editorUpdateKey={editorUpdateKey} />
        <WordCount editor={editor} />
      </div>
      <EditorContent editor={editor} />
      <EditorStatusBar editor={editor} editorUpdateKey={editorUpdateKey} />
      <BubbleMenu
        editor={editor}
        className="flex items-center gap-0.5 p-1.5 rounded-lg bg-zinc-900 border border-zinc-700 shadow-xl"
      >
        <ToolbarButtons editor={editor} editorUpdateKey={editorUpdateKey} />
      </BubbleMenu>
    </div>
  );
}
