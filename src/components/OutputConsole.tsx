import { useState, useCallback } from "react";
import CopyToast from "./CopyToast";

interface OutputConsoleProps {
  output: string | null;
  messages: Array<{ type: "success" | "error" | "info"; text: string }>;
  onClear: () => void;
  onExportCsv: () => void;
  hasRawResult: boolean;
}

const OutputConsole = ({ output, messages, onClear, onExportCsv, hasRawResult }: OutputConsoleProps) => {
  const [copyLabel, setCopyLabel] = useState("Copy");
  const [toastVisible, setToastVisible] = useState(false);

  const copyOutput = useCallback(() => {
    if (!output) return;
    navigator.clipboard.writeText(output);
    setCopyLabel("Copied ✓");
    setToastVisible(true);
    setTimeout(() => setCopyLabel("Copy"), 1500);
  }, [output]);

  return (
    <>
      <div className="h-full flex flex-col bg-output-bg border-l border-border">
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-3 h-8 border-b border-border flex-shrink-0">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mr-auto">
            Output
          </span>
          <button
            onClick={onClear}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear
          </button>
          <button
            onClick={copyOutput}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors min-w-[50px] text-right"
          >
            {copyLabel}
          </button>
          {hasRawResult && (
            <button
              onClick={onExportCsv}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              CSV
            </button>
          )}
        </div>

        {/* Results */}
        <div className="flex-1 overflow-auto custom-scrollbar p-3">
          {output ? (
            <pre className="font-mono-code text-xs text-foreground whitespace-pre leading-relaxed">
              {output}
            </pre>
          ) : (
            <div className="flex items-center justify-center h-full">
              <span className="text-xs text-muted-foreground">
                Run a query to see results
              </span>
            </div>
          )}
        </div>

        {/* Messages */}
        {messages.length > 0 && (
          <div className="border-t border-border px-3 py-2 space-y-1 max-h-32 overflow-y-auto custom-scrollbar flex-shrink-0">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
              Messages
            </span>
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`text-xs py-0.5 pl-2 border-l-2 ${
                  msg.type === "error"
                    ? "border-destructive text-destructive"
                    : msg.type === "success"
                    ? "border-success text-success"
                    : "border-muted-foreground/30 text-muted-foreground"
                }`}
              >
                {msg.text}
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="mt-auto px-3 py-1 flex justify-end border-t border-border/50">
          <span className="text-[9px] text-muted-foreground opacity-50">
            © chiragferwani
          </span>
        </div>
      </div>
      <CopyToast visible={toastVisible} onDone={() => setToastVisible(false)} />
    </>
  );
};

export default OutputConsole;
