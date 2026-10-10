import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from "react";
import { Editor, defaultValueCtx, editorViewCtx, editorViewOptionsCtx, remarkStringifyOptionsCtx, rootCtx } from "@milkdown/kit/core";
import {
  commonmark, toggleEmphasisCommand, toggleStrongCommand, wrapInBlockquoteCommand, wrapInBulletListCommand,
  wrapInHeadingCommand, wrapInOrderedListCommand, turnIntoTextCommand,
} from "@milkdown/kit/preset/commonmark";
import { gfm, insertTableCommand, toggleStrikethroughCommand } from "@milkdown/kit/preset/gfm";
import { history } from "@milkdown/kit/plugin/history";
import { clipboard } from "@milkdown/kit/plugin/clipboard";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import type { Ctx } from "@milkdown/kit/ctx";
import { callCommand, getMarkdown } from "@milkdown/kit/utils";
import { Milkdown, MilkdownProvider, useEditor, useInstance } from "@milkdown/react";
import { STRINGIFY_OPTIONS } from "../lib/markdown";

export type EditorCommand = "h1" | "h2" | "paragraph" | "bold" | "italic" | "strike" | "bullet" | "ordered" | "quote" | "table";

export interface EditorHandle {
  run: (cmd: EditorCommand) => void;
}

interface Props {
  /** Markdown body (without front matter). Remount with a new key to load another version. */
  value: string;
  readOnly: boolean;
  /** Called on every user change with the serialized markdown. */
  onChange: (markdown: string) => void;
  /** Called once with the editor's own serialization of `value`: the baseline for "dirty". */
  onReady?: (normalized: string) => void;
  ariaLabel?: string;
}

/**
 * WYSIWYG editor over a markdown AST (Milkdown: ProseMirror + remark).
 * CommonMark + GFM only; raw HTML is kept as-is in non-editable blocks.
 */
export const MarkdownEditor = forwardRef<EditorHandle, Props>(function MarkdownEditor(props, ref) {
  return (
    <MilkdownProvider>
      <Inner {...props} handleRef={ref} />
    </MilkdownProvider>
  );
});

function Inner({ value, readOnly, onChange, onReady, ariaLabel, handleRef }: Props & { handleRef: React.ForwardedRef<EditorHandle> }) {
  // The editor is created once and reads the latest props through refs.
  const ro = useRef(readOnly);
  const change = useRef(onChange);
  const ready = useRef(onReady);
  useLayoutEffect(() => {
    ro.current = readOnly;
    change.current = onChange;
    ready.current = onReady;
  });

  useEditor((root) =>
    Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, value);
        ctx.update(remarkStringifyOptionsCtx, (prev) => ({ ...prev, ...STRINGIFY_OPTIONS }));
        ctx.update(editorViewOptionsCtx, (prev) => ({
          ...prev,
          editable: () => !ro.current,
          attributes: { class: "milkdown-doc", "aria-label": ariaLabel ?? "", role: "textbox", "aria-multiline": "true" },
        }));
        ctx.get(listenerCtx).markdownUpdated((_ctx, markdown, prev) => {
          if (markdown !== prev) change.current(markdown);
        });
      })
      .use(commonmark)
      .use(gfm)
      .use(history)
      .use(clipboard)
      .use(listener),
  );

  const [loading, get] = useInstance();

  useEffect(() => {
    if (loading) return;
    const editor = get();
    if (!editor) return;
    ready.current?.(editor.action(getMarkdown()));
  }, [loading, get]);

  // Re-evaluate editability when readOnly flips (lock taken or released).
  useEffect(() => {
    if (loading) return;
    get()?.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      view.setProps({ editable: () => !readOnly });
    });
  }, [readOnly, loading, get]);

  useImperativeHandle(handleRef, () => ({
    run: (cmd) => {
      const editor = get();
      if (!editor || ro.current) return;
      const map: Record<EditorCommand, (ctx: Ctx) => boolean> = {
        h1: callCommand(wrapInHeadingCommand.key, 1),
        h2: callCommand(wrapInHeadingCommand.key, 2),
        paragraph: callCommand(turnIntoTextCommand.key),
        bold: callCommand(toggleStrongCommand.key),
        italic: callCommand(toggleEmphasisCommand.key),
        strike: callCommand(toggleStrikethroughCommand.key),
        bullet: callCommand(wrapInBulletListCommand.key),
        ordered: callCommand(wrapInOrderedListCommand.key),
        quote: callCommand(wrapInBlockquoteCommand.key),
        table: callCommand(insertTableCommand.key, { row: 3, col: 3 }),
      };
      editor.action(map[cmd]);
      editor.action((ctx) => ctx.get(editorViewCtx).focus());
    },
  }), [get]);

  return <Milkdown />;
}
