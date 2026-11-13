"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { EditorState, Compartment } from "@codemirror/state";
import { EditorView, keymap, placeholder as cmPlaceholder } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import {
  autocompletion,
  CompletionContext,
  CompletionResult,
} from "@codemirror/autocomplete";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { fetchTitleSuggestions } from "@/lib/api";

export interface MarkdownEditorHandle {
  insertSnippet: (snippet: string, cursorBackOffset?: number) => void;
}

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSave?: () => void;
  onSaveAndView?: () => void;
  onTogglePreview?: () => void;
  readOnly?: boolean;
  placeholder?: string;
}

const LINK_PREFIXES = [
  { label: "prereq:", detail: "prerequisite note", apply: "prereq:" },
  { label: "deep:", detail: "deep-dive note", apply: "deep:" },
];

async function wikilinkCompletion(
  context: CompletionContext
): Promise<CompletionResult | null> {
  // Match `[[` followed by optional `prereq:`/`deep:` and query text
  const match = context.matchBefore(/\[\[(?:(prereq|deep):)?[^\]\n]*/);
  if (!match) return null;

  const fullText = match.text.slice(2); // strip leading `[[`
  const prefixMatch = fullText.match(/^(prereq|deep):(.*)$/);
  const hasPrefix = Boolean(prefixMatch);
  const query = prefixMatch ? prefixMatch[2].trim() : fullText.trim();
  const prefixStart = match.from + 2 + (prefixMatch ? prefixMatch[1].length + 1 : 0);

  // Check if `]]` already follows cursor
  const afterCursor = context.state.sliceDoc(context.pos, context.pos + 2);
  const closingSuffix = afterCursor === "]]" ? "" : "]]";

  const titles = await fetchTitleSuggestions(query);
  const titleOptions = titles.map((t) => ({
    label: t.title,
    detail: t.visibility === "private" ? "private" : "public",
    type: "text",
    apply: `${t.title}${closingSuffix}`,
  }));

  if (!hasPrefix && !fullText.includes(":")) {
    const prefixOptions = LINK_PREFIXES.filter((p) =>
      p.label.startsWith(fullText.toLowerCase())
    ).map((p) => ({
      label: p.label,
      detail: p.detail,
      type: "keyword",
      apply: p.apply,
    }));
    return {
      from: match.from + 2,
      options: [...prefixOptions, ...titleOptions],
      filter: false,
    };
  }

  return {
    from: prefixStart,
    options: titleOptions,
    filter: false,
  };
}

const editorTheme = EditorView.theme({
  "&": {
    fontSize: "15px",
    fontFamily: "var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace",
    backgroundColor: "var(--bg)",
    color: "var(--text)",
    minHeight: "520px",
  },
  ".cm-content": {
    padding: "16px 0",
    lineHeight: "1.65",
    caretColor: "var(--text)",
  },
  ".cm-line": {
    padding: "0 4px",
  },
  ".cm-gutters": {
    display: "none",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-selectionBackground, ::selection": {
    backgroundColor: "var(--accent-bg) !important",
  },
  ".cm-tooltip.cm-tooltip-autocomplete": {
    backgroundColor: "var(--bg)",
    border: "1px solid var(--border-strong)",
    borderRadius: "4px",
    fontFamily: "var(--font-mono), monospace",
    fontSize: "13px",
  },
  ".cm-tooltip-autocomplete ul li[aria-selected]": {
    backgroundColor: "var(--accent-bg)",
    color: "var(--text)",
  },
});

const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(
  function MarkdownEditor(
    {
      value,
      onChange,
      onSave,
      onSaveAndView,
      onTogglePreview,
      readOnly = false,
      placeholder = "# Title\n\nStart writing in Markdown. Use [[Note Title]] or [[prereq:Note Title]] to link...",
    },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const viewRef = useRef<EditorView | null>(null);
    const readOnlyCompartment = useRef(new Compartment());

    useImperativeHandle(ref, () => ({
      insertSnippet(snippet: string, cursorBackOffset = 0) {
        const view = viewRef.current;
        if (!view) return;
        const { from, to } = view.state.selection.main;
        const nextPos = from + snippet.length - cursorBackOffset;
        view.dispatch({
          changes: { from, to, insert: snippet },
          selection: { anchor: nextPos },
        });
        view.focus();
      },
    }));

  // Keep latest callbacks in refs to avoid recreating the EditorView
  const callbacksRef = useRef({
    onChange,
    onSave,
    onSaveAndView,
    onTogglePreview,
  });
  callbacksRef.current = { onChange, onSave, onSaveAndView, onTogglePreview };

  useEffect(() => {
    if (!containerRef.current) return;

    const customKeymap = keymap.of([
      {
        key: "Mod-s",
        preventDefault: true,
        run: () => {
          callbacksRef.current.onSave?.();
          return true;
        },
      },
      {
        key: "Mod-Enter",
        preventDefault: true,
        run: () => {
          callbacksRef.current.onSaveAndView?.();
          return true;
        },
      },
      {
        key: "Mod-p",
        preventDefault: true,
        run: () => {
          callbacksRef.current.onTogglePreview?.();
          return true;
        },
      },
    ]);

    const state = EditorState.create({
      doc: value,
      extensions: [
        customKeymap,
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown(),
        syntaxHighlighting(defaultHighlightStyle),
        autocompletion({
          override: [wikilinkCompletion],
          activateOnTyping: true,
        }),
        EditorView.lineWrapping,
        cmPlaceholder(placeholder),
        editorTheme,
        readOnlyCompartment.current.of(EditorState.readOnly.of(readOnly)),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            callbacksRef.current.onChange(update.state.doc.toString());
          }
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Mount once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value changes (e.g. loading a note or restoring a revision)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  // Sync readOnly prop
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: readOnlyCompartment.current.reconfigure(
        EditorState.readOnly.of(readOnly)
      ),
    });
  }, [readOnly]);

  return (
    <div
      ref={containerRef}
      className="min-h-[520px] w-full cursor-text bg-bg"
      aria-label="Markdown editor"
    />
  );
});

export default MarkdownEditor;
