import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Sparkles, BookOpen, Users, MapPin, Settings2, Lightbulb, Globe, Palette, Loader2, RefreshCw, Feather, Scroll, Zap, Landmark, Flag, StickyNote, BookMarked, Trash2 } from 'lucide-react';
import { ChatMessage, ProjectContext, type CharacterFiche, type PlotPointFiche, type PlotPointStatus } from '../hooks/useEngine';
import { WRITING_PRESETS } from '../lib/writingPresets';

interface ChatSidebarProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  isLoading: boolean;
  context: ProjectContext;
  onUpdateContext: (key: keyof ProjectContext, value: unknown) => void;
  onGenerateContextElement: (type: keyof ProjectContext, currentContext: ProjectContext) => Promise<string | null>;
}

export function ChatSidebar({ messages, onSendMessage, isLoading, context, onUpdateContext, onGenerateContextElement }: ChatSidebarProps) {
  const [input, setInput] = useState('');
  const [activeTab, setActiveTab] = useState<'chat' | 'world' | 'story' | 'people'>('chat');
  const [generatingField, setGeneratingField] = useState<keyof ProjectContext | null>(null); 

  const handleGenerate = async (field: keyof ProjectContext) => {
    setGeneratingField(field);
    const result = await onGenerateContextElement(field, context);
    if (result) {
        if (field === 'characters') {
            const lines = result.split('\n').filter((line) => line.trim().length > 0);
            const fiches: CharacterFiche[] = lines.map((line, i) => ({
              id: `gen-${Date.now()}-${i}`,
              name: '',
              role: '',
              description: line.trim(),
            }));
            onUpdateContext(field, fiches);
        } else if (field === 'plotPoints') {
            const lines = result.split('\n').filter((line) => line.trim().length > 0);
            const fiches: PlotPointFiche[] = lines.map((line, i) => ({
              id: `gen-${Date.now()}-${i}`,
              title: '',
              description: line.trim(),
              status: 'pending' as PlotPointStatus,
            }));
            onUpdateContext(field, fiches);
        } else if (['authors', 'factions'].includes(field)) {
            const list = result.split('\n').filter((line) => line.trim().length > 0);
            onUpdateContext(field, list);
        } else {
            onUpdateContext(field, result);
        }
    }
    setGeneratingField(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    onSendMessage(input);
    setInput('');
  };

  const renderContextField = (
    label: string, 
    field: keyof ProjectContext, 
    icon: React.ReactNode, 
    placeholder: string, 
    isList: boolean = false,
    height: string = 'h-24'
  ) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-zinc-400 text-xs font-medium uppercase tracking-wider">
        <div className="flex items-center gap-2">{icon} {label}</div>
        <button onClick={() => handleGenerate(field)} disabled={!!generatingField} className="hover:text-indigo-400 disabled:opacity-50">
          {generatingField === field ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
        </button>
      </div>
      {isList ? (
        <textarea
          value={(context[field] as string[]).join('\n')}
          onChange={(e) => onUpdateContext(field, e.target.value.split('\n'))}
          placeholder={placeholder}
          className={`w-full ${height} bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500/50 resize-none`}
        />
      ) : (
        <textarea
          value={context[field] as string}
          onChange={(e) => onUpdateContext(field, e.target.value)}
          placeholder={placeholder}
          className={`w-full ${height} bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500/50 resize-none`}
        />
      )}
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-[#18181b] border-l border-white/5 w-80 lg:w-96">
      {/* Tabs */}
      <div className="flex border-b border-white/5 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveTab('chat')}
          className={`flex-1 min-w-[80px] py-3 text-xs font-medium flex flex-col items-center justify-center gap-1 ${
            activeTab === 'chat' ? 'text-white border-b-2 border-indigo-500' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Sparkles size={16} />
          Chat
        </button>
        <button
          onClick={() => setActiveTab('world')}
          className={`flex-1 min-w-[80px] py-3 text-xs font-medium flex flex-col items-center justify-center gap-1 ${
            activeTab === 'world' ? 'text-white border-b-2 border-indigo-500' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Globe size={16} />
          Monde
        </button>
        <button
          onClick={() => setActiveTab('story')}
          className={`flex-1 min-w-[80px] py-3 text-xs font-medium flex flex-col items-center justify-center gap-1 ${
            activeTab === 'story' ? 'text-white border-b-2 border-indigo-500' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <BookOpen size={16} />
          Histoire
        </button>
        <button
          onClick={() => setActiveTab('people')}
          className={`flex-1 min-w-[80px] py-3 text-xs font-medium flex flex-col items-center justify-center gap-1 ${
            activeTab === 'people' ? 'text-white border-b-2 border-indigo-500' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Users size={16} />
          Persos
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden relative">
        <AnimatePresence mode="wait">
          {activeTab === 'chat' && (
            <motion.div
              key="chat"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col"
            >
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 && (
                  <div className="text-center text-zinc-500 mt-10">
                    <Sparkles className="mx-auto mb-2 opacity-50" size={32} />
                    <p className="text-sm">Demandez-moi de trouver des idées, de décrire des personnages ou de vous aider à surmonter le syndrome de la page blanche.</p>
                  </div>
                )}
                {messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-zinc-800 text-zinc-200'
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-zinc-800 rounded-2xl px-4 py-3">
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <form onSubmit={handleSubmit} className="p-4 border-t border-white/5">
                <div className="relative">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Demandez à l'IA..."
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl py-3 pl-4 pr-12 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || isLoading}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
                  >
                    <Send size={16} />
                  </button>
                </div>
              </form>
            </motion.div>
          )}

          {activeTab === 'world' && (
            <motion.div
              key="world"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="absolute inset-0 overflow-y-auto p-4 space-y-6"
            >
               {renderContextField("Univers / Genre", "universe", <Globe size={12} />, "Cyberpunk, High Fantasy, Noir...", false, 'h-16')}
               {renderContextField("Cadre / Lieu", "setting", <MapPin size={12} />, "Néo-Tokyo, 2084. Il pleut toujours...", false, 'h-32')}
               {renderContextField("Système Magie / Tech", "magicSystem", <Zap size={12} />, "Magie dure basée sur les métaux...", false, 'h-32')}
               {renderContextField("Histoire", "history", <Landmark size={12} />, "La Grande Guerre s'est terminée il y a 100 ans...", false, 'h-32')}
               {renderContextField("Lore & Genèse", "lore", <Scroll size={12} />, "Règles du monde, mythes, magie, genèse...", false, 'h-32')}
               {renderContextField("Factions / Groupes", "factions", <Flag size={12} />, "La Résistance, L'Empire...", true, 'h-32')}
               <div className="space-y-3">
                 <div className="text-zinc-400 text-xs font-medium uppercase tracking-wider flex items-center justify-between">
                   <span className="flex items-center gap-2"><MapPin size={12} /> Lieux clés</span>
                   <button
                     type="button"
                     onClick={() => {
                       const locs = context.locations ?? [];
                       onUpdateContext('locations', [...locs, { id: Date.now().toString(), name: 'Nouveau lieu', description: '' }]);
                     }}
                     className="text-indigo-400 hover:text-indigo-300 text-xs"
                   >
                     + Ajouter
                   </button>
                 </div>
                 <div className="space-y-3">
                   {(context.locations ?? []).map((loc) => (
                     <div key={loc.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 space-y-2">
                       <div className="flex items-center justify-between gap-2">
                         <input
                           value={loc.name}
                           onChange={(e) => {
                             const next = (context.locations ?? []).map((l) => l.id === loc.id ? { ...l, name: e.target.value } : l);
                             onUpdateContext('locations', next);
                           }}
                           placeholder="Nom du lieu"
                           className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500/50"
                         />
                         <button
                           type="button"
                           onClick={() => {
                             const next = (context.locations ?? []).filter((l) => l.id !== loc.id);
                             onUpdateContext('locations', next);
                           }}
                           className="p-1.5 text-zinc-400 hover:text-red-400 rounded"
                           title="Supprimer"
                         >
                           <Trash2 size={14} />
                         </button>
                       </div>
                       <textarea
                         value={loc.description}
                         onChange={(e) => {
                           const next = (context.locations ?? []).map((l) => l.id === loc.id ? { ...l, description: e.target.value } : l);
                           onUpdateContext('locations', next);
                         }}
                         placeholder="Description, ambiance..."
                         className="w-full h-16 bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500/50 resize-none"
                       />
                     </div>
                   ))}
                 </div>
               </div>
            </motion.div>
          )}

          {activeTab === 'story' && (
            <motion.div
              key="story"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="absolute inset-0 overflow-y-auto p-4 space-y-6"
            >
               <div className="space-y-3">
                 <div className="text-zinc-400 text-xs font-medium uppercase tracking-wider flex items-center justify-between">
                   <span className="flex items-center gap-2"><BookOpen size={12} /> Livres de la saga</span>
                   <button
                     type="button"
                     onClick={() => {
                       const list = context.books ?? [];
                       onUpdateContext('books', [...list, { id: Date.now().toString(), title: `Livre ${list.length + 1}`, summary: '' }]);
                     }}
                     className="text-indigo-400 hover:text-indigo-300 text-xs"
                   >
                     + Livre
                   </button>
                 </div>
                 <div className="space-y-2">
                   {(context.books ?? []).map((book) => (
                     <div key={book.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-2 space-y-1">
                       <div className="flex items-center gap-2">
                         <input
                           value={book.title}
                           onChange={(e) => {
                             const next = (context.books ?? []).map((b) => (b.id === book.id ? { ...b, title: e.target.value } : b));
                             onUpdateContext('books', next);
                           }}
                           placeholder="Titre du livre"
                           className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500/50"
                         />
                         <button type="button" onClick={() => { const next = (context.books ?? []).filter((b) => b.id !== book.id); onUpdateContext('books', next); }} className="p-1 text-zinc-400 hover:text-red-400 rounded" title="Supprimer"><Trash2 size={12} /></button>
                       </div>
                       <textarea
                         value={book.summary}
                         onChange={(e) => {
                           const next = (context.books ?? []).map((b) => (b.id === book.id ? { ...b, summary: e.target.value } : b));
                           onUpdateContext('books', next);
                         }}
                         placeholder="Résumé court..."
                         className="w-full h-12 bg-zinc-800 border border-zinc-700 rounded p-1.5 text-xs text-zinc-400 focus:outline-none focus:border-indigo-500/50 resize-none"
                       />
                     </div>
                   ))}
                 </div>
               </div>
               {renderContextField("Plan / Structure", "outline", <Scroll size={12} />, "Chapitre 1 : L'Appel...", false, 'h-48')}
               {(context.chapterInfos?.length ?? 0) > 0 && (
                 <div className="space-y-3">
                   <div className="text-zinc-400 text-xs font-medium uppercase tracking-wider flex items-center gap-2">
                     <BookOpen size={12} /> Chapitres (H1)
                   </div>
                   <div className="space-y-4">
                     {(context.chapterInfos ?? []).map((ch, idx) => (
                       <div key={idx} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 space-y-2">
                         <div className="text-xs font-medium text-indigo-400">Ch. {idx + 1} — {ch.title}</div>
                         <textarea
                           placeholder="Résumé du chapitre"
                           value={ch.summary ?? ''}
                           onChange={(e) => {
                             const next = [...(context.chapterInfos ?? [])];
                             next[idx] = { ...next[idx], summary: e.target.value };
                             onUpdateContext('chapterInfos', next);
                           }}
                           className="w-full h-16 bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500/50 resize-none"
                         />
                         <textarea
                           placeholder="Objectif / conflit / beat"
                           value={ch.plotGoal ?? ''}
                           onChange={(e) => {
                             const next = [...(context.chapterInfos ?? [])];
                             next[idx] = { ...next[idx], plotGoal: e.target.value };
                             onUpdateContext('chapterInfos', next);
                           }}
                           className="w-full h-14 bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500/50 resize-none"
                         />
                       </div>
                     ))}
                   </div>
                 </div>
               )}
               <div className="space-y-3">
                 <div className="text-zinc-400 text-xs font-medium uppercase tracking-wider flex items-center justify-between">
                   <span className="flex items-center gap-2"><Settings2 size={12} /> Points d'intrigue</span>
                   <div className="flex items-center gap-1">
                     <button type="button" onClick={() => handleGenerate('plotPoints')} disabled={!!generatingField} className="p-1 text-zinc-400 hover:text-indigo-400 disabled:opacity-50" title="Générer avec l'IA">
                       {generatingField === 'plotPoints' ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                     </button>
                     <button
                       type="button"
                       onClick={() => {
                         const pts = context.plotPoints ?? [];
                         onUpdateContext('plotPoints', [...pts, { id: Date.now().toString(), title: 'Nouvel événement', description: '', status: 'pending' as PlotPointStatus }]);
                       }}
                       className="text-indigo-400 hover:text-indigo-300 text-xs"
                     >
                       + Ajouter
                     </button>
                   </div>
                 </div>
                 <div className="space-y-3">
                   {(context.plotPoints ?? []).map((plot) => (
                     <div key={plot.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 space-y-2">
                       <div className="flex items-center justify-between gap-2">
                         <input
                           value={plot.title}
                           onChange={(e) => {
                             const next = (context.plotPoints ?? []).map((p) => (p.id === plot.id ? { ...p, title: e.target.value } : p));
                             onUpdateContext('plotPoints', next);
                           }}
                           placeholder="Titre de l'événement"
                           className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500/50"
                         />
                         <select
                           value={plot.status}
                           onChange={(e) => {
                             const next = (context.plotPoints ?? []).map((p) => (p.id === plot.id ? { ...p, status: e.target.value as PlotPointStatus } : p));
                             onUpdateContext('plotPoints', next);
                           }}
                           className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:border-indigo-500/50"
                         >
                           <option value="pending">En attente</option>
                           <option value="active">Actif</option>
                           <option value="resolved">Résolu</option>
                         </select>
                         <button type="button" onClick={() => { const next = (context.plotPoints ?? []).filter((p) => p.id !== plot.id); onUpdateContext('plotPoints', next); }} className="p-1.5 text-zinc-400 hover:text-red-400 rounded" title="Supprimer"><Trash2 size={14} /></button>
                       </div>
                       <textarea
                         value={plot.description}
                         onChange={(e) => {
                           const next = (context.plotPoints ?? []).map((p) => (p.id === plot.id ? { ...p, description: e.target.value } : p));
                           onUpdateContext('plotPoints', next);
                         }}
                         placeholder="Ce qui se passe..."
                         className="w-full h-14 bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500/50 resize-none"
                       />
                     </div>
                   ))}
                 </div>
               </div>
               {renderContextField("Thèmes", "themes", <Lightbulb size={12} />, "Rédemption, Perte, Espoir...", false, 'h-20')}
               {renderContextField("Inspiration", "inspiration", <Sparkles size={12} />, "Blade Runner rencontre Harry Potter...", false, 'h-20')}
               {renderContextField("Notes", "notes", <StickyNote size={12} />, "Idées en vrac...", false, 'h-32')}
            </motion.div>
          )}

          {activeTab === 'people' && (
            <motion.div
              key="people"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="absolute inset-0 overflow-y-auto p-4 space-y-6"
            >
               <div className="space-y-2">
                 <div className="flex items-center gap-2 text-zinc-400 text-xs font-medium uppercase tracking-wider">
                   <BookMarked size={12} /> Profil d'écriture
                 </div>
                 <select
                   className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500/50"
                   value=""
                   onChange={(e) => {
                     const id = e.target.value;
                     if (!id) return;
                     const preset = WRITING_PRESETS.find((p) => p.id === id);
                     if (preset) {
                       onUpdateContext('register', preset.register);
                       onUpdateContext('pov', preset.pov);
                       onUpdateContext('rhythm', preset.rhythm);
                       onUpdateContext('tone', preset.tone);
                       onUpdateContext('style', preset.style);
                       onUpdateContext('authors', preset.authors);
                     }
                     e.target.value = '';
                   }}
                 >
                   <option value="">Appliquer un preset...</option>
                   {WRITING_PRESETS.map((p) => (
                     <option key={p.id} value={p.id}>{p.name}</option>
                   ))}
                 </select>
               </div>
               <div className="space-y-3">
                 <div className="text-zinc-400 text-xs font-medium uppercase tracking-wider flex items-center justify-between gap-2">
                   <span className="flex items-center gap-2"><Users size={12} /> Personnages</span>
                   <div className="flex items-center gap-1">
                     <button type="button" onClick={() => handleGenerate('characters')} disabled={!!generatingField} className="p-1 text-zinc-400 hover:text-indigo-400 disabled:opacity-50" title="Générer avec l'IA">
                       {generatingField === 'characters' ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                     </button>
                     <button
                       type="button"
                       onClick={() => {
                         const chars = context.characters ?? [];
                         onUpdateContext('characters', [...chars, { id: Date.now().toString(), name: 'Nouveau', role: '', description: '' }]);
                       }}
                       className="text-indigo-400 hover:text-indigo-300 text-xs"
                     >
                       + Ajouter
                     </button>
                   </div>
                 </div>
                 <div className="space-y-3">
                   {(context.characters ?? []).map((char) => (
                     <div key={char.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 space-y-2">
                       <div className="flex items-center justify-between gap-2">
                         <input
                           value={char.name}
                           onChange={(e) => {
                             const next = (context.characters ?? []).map((c) => (c.id === char.id ? { ...c, name: e.target.value } : c));
                             onUpdateContext('characters', next);
                           }}
                           placeholder="Nom"
                           className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500/50"
                         />
                         <input
                           value={char.role}
                           onChange={(e) => {
                             const next = (context.characters ?? []).map((c) => (c.id === char.id ? { ...c, role: e.target.value } : c));
                             onUpdateContext('characters', next);
                           }}
                           placeholder="Rôle"
                           className="w-24 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-400 focus:outline-none focus:border-indigo-500/50"
                         />
                         <button
                           type="button"
                           onClick={() => {
                             const next = (context.characters ?? []).filter((c) => c.id !== char.id);
                             onUpdateContext('characters', next);
                           }}
                           className="p-1.5 text-zinc-400 hover:text-red-400 rounded"
                           title="Supprimer"
                         >
                           <Trash2 size={14} />
                         </button>
                       </div>
                       <textarea
                         value={char.description}
                         onChange={(e) => {
                           const next = (context.characters ?? []).map((c) => (c.id === char.id ? { ...c, description: e.target.value } : c));
                           onUpdateContext('characters', next);
                         }}
                         placeholder="Description, psychologie, objectifs..."
                         className="w-full h-20 bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500/50 resize-none"
                       />
                     </div>
                   ))}
                 </div>
               </div>
               {renderContextField("Auteur de référence (style)", "referenceAuthor", <Feather size={12} />, "Ex: Victor Hugo, Stephen King...", false, 'h-12')}
               {renderContextField("Auteurs de référence", "authors", <Feather size={12} />, "Asimov, Gibson...", true, 'h-24')}
               {renderContextField("Note sur les auteurs", "authorNotes", <Feather size={12} />, "Ce qu'on emprunte : dialogues percutants, descriptions...", false, 'h-16')}
               {renderContextField("Registre", "register", <Palette size={12} />, "Littéraire, SFFF, thriller, romance...", false, 'h-14')}
               {renderContextField("POV", "pov", <Palette size={12} />, "1re personne, 3e limité, 3e omniscient...", false, 'h-14')}
               {renderContextField("Rythme", "rhythm", <Palette size={12} />, "Phrases courtes, beaucoup de dialogue...", false, 'h-14')}
               {renderContextField("Ton", "tone", <Palette size={12} />, "Sombre, ironique, lyrique, neutre...", false, 'h-14')}
               {renderContextField("Style / Ton (libre)", "style", <Palette size={12} />, "Sombre, réaliste, rythmé...", false, 'h-20')}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
