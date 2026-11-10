import { $prose } from "@milkdown/kit/utils";
import { Plugin, PluginKey, type EditorState } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet, type EditorView } from "@milkdown/kit/prose/view";
import type { Node } from "@milkdown/kit/prose/model";
import type { MockupTheme } from "../lib/mockupTheme";
import { recolor, renderMermaid } from "./mermaid";

// FTR.HMR.SPEC-0004 R5, design §2, §3.1: a code block of the language mermaid is drawn under its text. Reading
// hides the text (the class mermaid-src); editing shows the text and under it the preview, drawn 300 ms after the
// last change. The block stays a code block of the document: the markdown is not touched.

export const mermaidKey = new PluginKey<DecorationSet>("hmr-mermaid");

export interface MermaidTexts {
  loading: string;
  preview: string;
  error: (message: string, line?: number) => string;
  zoomIn: string;
  zoomOut: string;
  fit: string;
}

const debounceMs = 300;

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + ":" + s.length;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** The diagram of a block: a placeholder while mermaid loads, then the SVG with zoom, or the error. */
function diagram(view: EditorView, src: string, theme: MockupTheme, texts: MermaidTexts): HTMLElement {
  const box = el("div", "mermaid-diagram");
  box.contentEditable = "false";
  if (view.editable) box.append(el("div", "mermaid-caption small muted", texts.preview));
  const stage = el("div", "mermaid-loading", texts.loading);
  box.append(stage);
  const draw = async () => {
    if (!box.isConnected && view.editable) return; // a newer text replaced this preview
    const r = await renderMermaid(src, theme);
    if ("error" in r) {
      stage.className = "mermaid-error";
      stage.textContent = texts.error(r.error, r.line);
      return;
    }
    let scale = 1;
    const tools = el("div", "mermaid-tools");
    const canvas = el("div", "mermaid-canvas");
    // the SVG is drawn with securityLevel strict and sanitized by DOMPurify (arch §6)
    canvas.innerHTML = r.svg;
    const svg = canvas.querySelector("svg");
    if (svg) recolor(svg);
    // the natural width of the diagram, at most the width of the document; + and − zoom from it, ↔ fits the width
    const natural = svg?.viewBox.baseVal?.width || svg?.getBoundingClientRect().width || 800;
    let fit = false;
    const apply = () => {
      if (!svg) return;
      svg.removeAttribute("height");
      svg.style.height = "auto";
      svg.style.maxWidth = fit || scale === 1 ? "100%" : "none";
      svg.style.width = fit ? "100%" : `${Math.round(natural * scale)}px`;
    };
    const button = (label: string, text: string, on: () => void) => {
      const b = el("button", "iconbtn mermaid-tool", text);
      b.type = "button";
      b.title = label;
      b.setAttribute("aria-label", label);
      b.addEventListener("click", (e) => {
        e.preventDefault();
        on();
        apply();
      });
      return b;
    };
    tools.append(
      button(texts.zoomIn, "+", () => { fit = false; scale = Math.min(4, scale * 1.25); }),
      button(texts.zoomOut, "−", () => { fit = false; scale = Math.max(0.25, scale / 1.25); }),
      button(texts.fit, "↔", () => { fit = true; scale = 1; }),
    );
    canvas.addEventListener("wheel", (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      fit = false;
      scale = Math.min(4, Math.max(0.25, scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
      apply();
    }, { passive: false });
    apply();
    stage.replaceWith(tools, canvas);
  };
  if (view.editable) window.setTimeout(() => void draw(), debounceMs);
  else void draw();
  return box;
}

function build(doc: Node, theme: MockupTheme, texts: MermaidTexts, editable: boolean): DecorationSet {
  const decos: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "code_block") return true;
    if (String(node.attrs.language).trim().toLowerCase() === "mermaid") {
      const src = node.textContent;
      const end = pos + node.nodeSize;
      decos.push(Decoration.node(pos, end, { class: "mermaid-src" }));
      decos.push(Decoration.widget(end, (view) => diagram(view, src, theme, texts), {
        // a new theme, mode or language draws the diagram again: the caption and the texts follow them
        key: `mermaid:${theme}:${editable ? "edit" : "read"}:${hash(texts.preview)}:${hash(src)}`, side: -1, ignoreSelection: true, stopEvent: () => true,
      }));
    }
    return false;
  });
  return DecorationSet.create(doc, decos);
}

/** The plugin; theme, texts and the mode are read when the decorations are built, and a transaction with the meta
 * of mermaidKey rebuilds them (a new theme, mode or language). */
export function mermaidPlugin(theme: () => MockupTheme, texts: () => MermaidTexts, editable: () => boolean) {
  return $prose(() => new Plugin<DecorationSet>({
    key: mermaidKey,
    state: {
      init: (_, state: EditorState) => build(state.doc, theme(), texts(), editable()),
      apply: (tr, old) => (tr.docChanged || tr.getMeta(mermaidKey) ? build(tr.doc, theme(), texts(), editable()) : old.map(tr.mapping, tr.doc)),
    },
    props: {
      decorations: (state) => mermaidKey.getState(state),
    },
  }));
}
