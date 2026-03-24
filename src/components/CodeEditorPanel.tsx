import { useRef, useEffect, useState, useCallback } from "react";
import type { Session } from "@/pages/BitLab";
import Autocomplete from "./Autocomplete";
import { detectMode } from "@/lib/keywords";

interface CodeEditorPanelProps {
  session: Session;
  sessions: Session[];
  messages?: Array<{ type: "success" | "error" | "info"; text: string }>;
  output?: string | null;
  onCodeChange: (code: string) => void;
  onModeChange: (mode: "SQL" | "PL/SQL") => void;
  onRun: (codeOverride?: string) => void;
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

function getCurrentStatementAtCursor(code: string, cursorPos: number): string {
  const text = code;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let blockDepth = 0;
  let start = 0;
  let end = text.length;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === "'" && !inDoubleQuote) {
      if (inSingleQuote && i + 1 < text.length && text[i + 1] === "'") {
        i++;
        continue;
      }
      inSingleQuote = !inSingleQuote;
    } else if (ch === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
    }

    if (!inSingleQuote && !inDoubleQuote && /[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < text.length && /[A-Za-z0-9_$]/.test(text[j])) j++;
      const token = text.slice(i, j).toUpperCase();
      if (token === "BEGIN") blockDepth++;
      if (token === "END" && blockDepth > 0) blockDepth--;
      i = j - 1;
      continue;
    }

    if (ch === ";" && !inSingleQuote && !inDoubleQuote && blockDepth === 0) {
      if (i < cursorPos) {
        start = i + 1;
      } else {
        end = i + 1;
        break;
      }
    }
  }

  return text.slice(start, end).trim();
}

const CodeEditorPanel = ({
  session,
  sessions,
  messages = [],
  output = null,
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

  // Bottom Panel state
  const [panelVisible, setPanelVisible] = useState(false);
  const [panelHeight, setPanelHeight] = useState(120);

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

  const handleRunWrapper = useCallback(() => {
    setPanelVisible(true);
    if (panelHeight < 60) setPanelHeight(120);
    onRun();
  }, [onRun, panelHeight]);

  const handleRunSelection = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;

    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = start !== end ? ta.value.slice(start, end).trim() : "";
    const codeToRun = selected || getCurrentStatementAtCursor(ta.value, ta.selectionStart);
    if (!codeToRun.trim()) return;

    setPanelVisible(true);
    if (panelHeight < 60) setPanelHeight(120);
    onRun(codeToRun);
  }, [onRun, panelHeight]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "Enter") {
        e.preventDefault();
        handleRunSelection();
      } else if (e.ctrlKey && e.key === "Enter") {
        e.preventDefault();
        handleRunWrapper();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleRunWrapper, handleRunSelection]);

  const handlePanelResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = panelHeight;

    const onMove = (ev: MouseEvent) => {
      const delta = startY - ev.clientY;
      const maxHeight = editorContainerRef.current ? editorContainerRef.current.clientHeight * 0.4 : 600;
      setPanelHeight(Math.max(60, Math.min(maxHeight, startHeight + delta)));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const errorCount = messages.filter(m => m.type === "error").length;
  // Let "warnings" be info messages that are not just "Run at" timing info
  const warningCount = messages.filter(m => m.type === "info" && !m.text.startsWith("── Run at")).length;
  const dbmsOutputLines = output?.startsWith("DBMS_OUTPUT:\n") ? output.split("\n").slice(1) : [];

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

      {/* Editor area wrapper */}
      <div ref={editorContainerRef} className="flex flex-col flex-1 overflow-hidden relative">
        
        {/* Editor actual content */}
        <div className="flex flex-1 overflow-hidden relative">
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
            onClick={handleRunWrapper}
            className={`absolute top-2 right-3 px-3 py-1 text-xs font-mono-code font-semibold border border-accent text-accent hover:bg-accent hover:text-accent-foreground transition-colors ${
              hasContent ? "run-pulse" : ""
            }`}
          >
            Run ▶
          </button>
          <button
            onClick={handleRunSelection}
            className="absolute top-2 right-[74px] px-2.5 py-1 text-[11px] font-mono-code border border-border text-muted-foreground hover:text-foreground hover:border-accent transition-colors"
            title="Run selection or current statement (Ctrl+Shift+Enter)"
          >
            Run Sel
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

        {/* Resizable Bottom Errors Panel */}
        {panelVisible && (
          <div style={{ height: panelHeight }} className="flex flex-col bg-editor-bg border-t border-border relative flex-shrink-0">
            {/* Drag handle */}
            <div
              className="absolute top-0 left-0 right-0 h-[2px] cursor-row-resize hover:bg-[rgba(0,184,217,1)] hover:shadow-[0_0_8px_rgba(0,184,217,0.8)] z-10 transition-colors"
              onMouseDown={handlePanelResize}
            />
            
            {panelHeight <= 70 ? (
              // Collapsed state
              <div className="flex items-center justify-between px-3 h-full pt-1">
                <span className="text-xs font-mono-code text-muted-foreground flex items-center gap-2">
                  <span className={errorCount > 0 ? "text-red-400" : ""}>{errorCount} errors</span>
                  <span>·</span>
                  <span className={warningCount > 0 ? "text-yellow-400" : ""}>{warningCount} warnings</span>
                </span>
                <button onClick={() => setPanelVisible(false)} className="text-muted-foreground hover:text-foreground text-lg leading-none p-1">
                  ×
                </button>
              </div>
            ) : (
              // Expanded state
              <>
                <div className="flex justify-end p-1 absolute top-1 right-2 z-20">
                  <button onClick={() => setPanelVisible(false)} className="text-muted-foreground hover:text-foreground text-lg leading-none bg-editor-bg rounded px-1 pb-1">
                    ×
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-3 custom-scrollbar font-mono-code text-xs space-y-2 mt-3">
                  {messages.filter(m => m.text && !m.text.startsWith("── Run at")).map((m, i) => (
                    <div
                      key={`msg-${i}`}
                      className={`block pl-2 py-1 ${
                        m.type === "error"
                          ? "border-l-2 border-l-red-500 text-red-500"
                          : m.type === "success"
                          ? "border-l-2 border-l-green-500 text-green-500"
                          : "border-l-2 border-border text-muted-foreground"
                      }`}
                    >
                      {m.text}
                    </div>
                  ))}
                  {dbmsOutputLines.map((line, i) => (
                    <div key={`dbms-${i}`} className="block pl-2 py-1 border-l-2 border-l-accent text-accent">
                      DBMS_OUTPUT: {line}
                    </div>
                  ))}
                  {messages.filter(m => !m.text.startsWith("── Run at")).length === 0 && dbmsOutputLines.length === 0 && (
                    <div className="text-muted-foreground italic">No messages to display</div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

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
