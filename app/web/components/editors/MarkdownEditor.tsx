import { markdown } from "@codemirror/lang-markdown";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import { useEffect, useRef } from "react";

export interface MarkdownEditorProps {
  value: string;
  onChange?: (next: string) => void;
  onBlur?: (final: string) => void;
  placeholder?: string;
  minHeight?: number;
  className?: string;
  /** Read-only mode for past-dump preview etc. */
  readOnly?: boolean;
  showLineNumbers?: boolean;
}

const themeExtension = EditorView.theme({
  "&": {
    backgroundColor: "var(--background)",
    color: "var(--text-primary)",
    fontFamily: "var(--font-mono)",
    fontSize: "13px",
    height: "100%",
  },
  ".cm-scroller": { fontFamily: "var(--font-mono)" },
  ".cm-content": { padding: "12px 14px", caretColor: "var(--accent)" },
  ".cm-activeLine": { backgroundColor: "transparent" },
  ".cm-gutters": {
    backgroundColor: "var(--surface)",
    color: "var(--text-muted)",
    border: "none",
  },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent)" },
  "&.cm-focused .cm-selectionBackground, ::selection": { backgroundColor: "var(--accent-tint)" },
});

export function MarkdownEditor({
  value,
  onChange,
  onBlur,
  placeholder,
  minHeight = 200,
  className,
  readOnly,
  showLineNumbers,
}: MarkdownEditorProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const view = useRef<EditorView | null>(null);
  const latestValue = useRef(value);
  const onBlurRef = useRef(onBlur);
  const onChangeRef = useRef(onChange);

  // Keep refs up to date so the static EditorView callbacks read fresh values
  useEffect(() => {
    onBlurRef.current = onBlur;
    onChangeRef.current = onChange;
  }, [onBlur, onChange]);

  useEffect(() => {
    if (!host.current) return;
    const extensions = [
      markdown(),
      themeExtension,
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      EditorView.lineWrapping,
      EditorView.editable.of(!readOnly),
      EditorState.readOnly.of(!!readOnly),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) {
          const text = u.state.doc.toString();
          latestValue.current = text;
          onChangeRef.current?.(text);
        }
      }),
      EditorView.domEventHandlers({
        blur: () => {
          onBlurRef.current?.(latestValue.current);
        },
      }),
    ];
    if (showLineNumbers) extensions.unshift(lineNumbers());
    const state = EditorState.create({ doc: value, extensions });
    view.current = new EditorView({ state, parent: host.current });
    return () => {
      view.current?.destroy();
      view.current = null;
    };
    // intentionally only on mount; external value updates handled below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reflect external value changes (e.g. switching dumps) without losing focus mid-typing
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const current = v.state.doc.toString();
    if (value !== current) {
      v.dispatch({ changes: { from: 0, to: current.length, insert: value } });
      latestValue.current = value;
    }
  }, [value]);

  return (
    <div
      ref={host}
      className={`overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--background)] ${className ?? ""}`}
      style={{ minHeight }}
      data-placeholder={placeholder}
    />
  );
}
