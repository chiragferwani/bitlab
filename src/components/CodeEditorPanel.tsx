import { useRef, useEffect, useState, useCallback } from "react";
import type { Session } from "@/pages/BitLab";
import Autocomplete from "./Autocomplete";
import { detectMode } from "@/lib/keywords";

interface CodeEditorPanelProps {
  session: Session;
  sessions: Session[];
  onCodeChange: (code: string) => void;
  onModeChange: (mode: "SQL" | "PL/SQL") => void;
  onRun: () => void;
  onSelectSession: (id: string) => void;
}

/**
 * Gets the current word being typed at the cursor position.
 */
function getCurrentWord(text: string, cursorPos: number): { word: string; start: number } {
  let start = cursorPos;
  while (start > 0 && /[\w.]/.test(text[start - 1])) {
    start--;
  }
  return { word: text.substring(start, cursorPos), start };
}

const CodeEditorPanel = ({
  session,
  sessions,
  onCodeChange,
  onModeChange,
  onRun,
  onSelectSession,
}: CodeEditorPanelProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });

  // Autocomplete state
  const [acVisible, setAcVisible] = useState(false);
  const [acPrefix, setAcPrefix] = useState("");
  const [acPosition, setAcPosition] = useState({ top: 0, left: 0 });
  const [acIndex, setAcIndex] = useState(0);
  const [acWordStart, setAcWordStart] = useState(0);

  const lines = session.code.split("\n");
  const lineCount = Math.max(lines.length, 20);
  const hasContent = session.code.trim().length > 0;

  const updateCursor = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const before = ta.value.substring(0, ta.selectionStart);
    const line = before.split("\n").length;
    const col = before.length - before.lastIndexOf("\n");
    setCursorPos({ line, col });

    // Update autocomplete
    const { word, start } = getCurrentWord(ta.value, ta.selectionStart);
    if (word.length >= 2) {
      setAcPrefix(word);
      setAcWordStart(start);
      setAcIndex(0);

      // Calculate position for dropdown
      const linesBefore = before.split("\n");
      const currentLineNum = linesBefore.length;
      const currentCol = linesBefore[linesBefore.length - 1].length;

      // Approximate pixel position based on character metrics
      const lineHeight = 19.2; // text-sm leading-[1.6] ≈ 14px * 1.6 = 22.4, but monospace is ~19.2
      const charWidth = 8.4; // JetBrains Mono at 14px ≈ 8.4px per char
      const lineNumWidth = 32; // line number gutter approximation

      setAcPosition({
        top: (currentLineNum) * lineHeight + 12, // +padding
        left: lineNumWidth + (currentCol * charWidth) + 12,
      });
      setAcVisible(true);
    } else {
      setAcVisible(false);
    }
  }, []);

  const handleAcSelect = useCallback((word: string) => {
    const ta = textareaRef.current;
    if (!ta) return;

    const before = ta.value.substring(0, acWordStart);
    const after = ta.value.substring(ta.selectionStart);
    const newCode = before + word + " " + after;
    onCodeChange(newCode);
    setAcVisible(false);

    // Restore focus and cursor position
    requestAnimationFrame(() => {
      ta.focus();
      const newPos = acWordStart + word.length + 1;
      ta.selectionStart = newPos;
      ta.selectionEnd = newPos;
    });
  }, [acWordStart, onCodeChange]);

  const handleCodeInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newCode = e.target.value;
    onCodeChange(newCode);

    // Auto-detect mode reactively
    const mode = detectMode(newCode);
    if (mode !== session.mode) {
      onModeChange(mode);
    }
  }, [onCodeChange, onModeChange, session.mode]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "Enter") {
        e.preventDefault();
        onRun();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onRun]);

  return (
    <div className="flex flex-col h-full bg-editor-bg">
      {/* Tab bar */}
      {sessions.length > 1 && (
        <div className="flex items-center gap-0 border-b border-border bg-status-bar overflow-x-auto">
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => onSelectSession(s.id)}
              className={`px-3 py-1.5 text-xs font-mono-code border-r border-border transition-colors whitespace-nowrap ${
                s.id === session.id
                  ? "text-foreground bg-editor-bg border-b-2 border-b-accent"
                  : "text-muted-foreground hover:text-foreground bg-status-bar"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {/* Editor area */}
      <div ref={editorContainerRef} className="flex flex-1 overflow-hidden relative">
        {/* Line numbers */}
        <div className="flex flex-col items-end py-3 px-2 select-none bg-editor-bg border-r border-border/50 overflow-hidden flex-shrink-0">
          {Array.from({ length: lineCount }, (_, i) => (
            <span
              key={i}
              className="font-mono-code text-xs leading-[1.6] text-line-number"
            >
              {i + 1}
            </span>
          ))}
        </div>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={session.code}
          onChange={handleCodeInput}
          onKeyUp={updateCursor}
          onClick={updateCursor}
          spellCheck={false}
          className="flex-1 bg-transparent text-foreground font-mono-code text-sm leading-[1.6] p-3 resize-none outline-none custom-scrollbar"
          style={{ tabSize: 4 }}
        />

        {/* Run button */}
        <button
          onClick={onRun}
          className={`absolute top-2 right-3 px-3 py-1 text-xs font-mono-code font-semibold border border-accent text-accent hover:bg-accent hover:text-accent-foreground transition-colors ${
            hasContent ? "run-pulse" : ""
          }`}
        >
          Run ▶
        </button>

        {/* Autocomplete dropdown */}
        <Autocomplete
          prefix={acPrefix}
          position={acPosition}
          visible={acVisible}
          selectedIndex={acIndex}
          onSelect={handleAcSelect}
          onIndexChange={setAcIndex}
          onDismiss={() => setAcVisible(false)}
        />
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-3 h-6 bg-status-bar border-t border-border text-[10px] font-mono-code text-muted-foreground flex-shrink-0">
        <div className="flex items-center gap-4">
          <span className="hover:text-accent transition-colors">
            {session.mode}
          </span>
          <span>
            Ln {cursorPos.line}, Col {cursorPos.col}
          </span>
          <span>{session.code.length} chars</span>
        </div>
        <span>UTF-8</span>
      </div>
    </div>
  );
};

export default CodeEditorPanel;
