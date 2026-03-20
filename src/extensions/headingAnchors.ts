import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

/**
 * Assigne des id stables (chapter-0, chapter-1, …) à chaque <h1> du DOM
 * pour permettre le scroll depuis la table des matières.
 * N'est exécuté que lorsque le document change (pas à chaque transaction de sélection).
 */
function applyHeadingAnchors(dom: HTMLElement): void {
  const h1s = dom.querySelectorAll('h1');
  h1s.forEach((el, index) => {
    (el as HTMLElement).id = 'chapter-' + index;
  });
}

export const HeadingAnchors = Extension.create({
  name: 'headingAnchors',

  addProseMirrorPlugins() {
    const key = new PluginKey(this.name);

    return [
      new Plugin({
        key,
        view(editorView) {
          const schedule = () => {
            requestAnimationFrame(() => {
              if (editorView.dom && editorView.dom instanceof HTMLElement) {
                applyHeadingAnchors(editorView.dom);
              }
            });
          };
          schedule();
          return {
            update(view, prevState) {
              if (prevState.doc !== view.state.doc) schedule();
            },
          };
        },
      }),
    ];
  },
});
