import { Extension } from '@tiptap/core';
import type { Node } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

const HIGHLIGHT_DURATION_MS = 5 * 60 * 1000; // 5 minutes

export const TEMPORARY_HIGHLIGHT_META_KEY = 'addTemporaryHighlight';

export const TEMPORARY_HIGHLIGHT_DURATION_MS = HIGHLIGHT_DURATION_MS;

interface HighlightRange {
  from: number;
  to: number;
  expiresAt: number;
}

const pluginKey = new PluginKey<{ ranges: HighlightRange[]; decorationSet: DecorationSet }>('temporaryHighlight');

function buildDecorationSet(doc: Node, ranges: HighlightRange[]): DecorationSet {
  const now = Date.now();
  const valid = ranges.filter((r) => r.expiresAt > now && r.from < r.to);
  if (valid.length === 0) return DecorationSet.empty;
  const decorations = valid.map((r) =>
    Decoration.inline(r.from, r.to, { class: 'novelcraft-inserted-highlight' })
  );
  return DecorationSet.create(doc, decorations);
}

export const TemporaryHighlight = Extension.create({
  name: 'temporaryHighlight',

  addProseMirrorPlugins() {
    const key = pluginKey;

    return [
      new Plugin({
        key,
        state: {
          init() {
            return { ranges: [], decorationSet: DecorationSet.empty };
          },
          apply(tr, value, oldState, newState) {
            let ranges = value.ranges;
            const add = tr.getMeta(TEMPORARY_HIGHLIGHT_META_KEY) as
              | { from: number; to: number; expiresAt: number }
              | undefined;
            if (add) {
              ranges = [...ranges, { from: add.from, to: add.to, expiresAt: add.expiresAt }];
            }
            const now = Date.now();
            ranges = ranges.filter((r) => r.expiresAt > now);
            if (tr.docChanged && ranges.length) {
              const mapping = tr.mapping;
              ranges = ranges
                .map((r) => ({
                  from: mapping.map(r.from),
                  to: mapping.map(r.to),
                  expiresAt: r.expiresAt,
                }))
                .filter((r) => r.from < r.to);
            }
            const decorationSet = buildDecorationSet(newState.doc, ranges);
            return { ranges, decorationSet };
          },
        },
        props: {
          decorations(state) {
            return key.getState(state)?.decorationSet ?? DecorationSet.empty;
          },
        },
        view(editorView) {
          const interval = setInterval(() => {
            const state = editorView.state;
            const pluginState = key.getState(state);
            if (
              pluginState?.ranges.length &&
              pluginState.ranges.some((r) => r.expiresAt <= Date.now())
            ) {
              editorView.dispatch(state.tr.setMeta('temporaryHighlightTick', true));
            }
          }, 1000);
          return {
            destroy() {
              clearInterval(interval);
            },
          };
        },
      }),
    ];
  },
});
