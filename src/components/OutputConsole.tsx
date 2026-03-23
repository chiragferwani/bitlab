interface OutputConsoleProps {
  output: string | null;
  messages: Array<{ type: "success" | "error" | "info"; text: string }>;
  onClear: () => void;
}

const OutputConsole = ({ output, messages, onClear }: OutputConsoleProps) => {
  const copyOutput = () => {
    if (output) navigator.clipboard.writeText(output);
  };

  const exportCsv = () => {
    // Placeholder export
    const csv = "id,name,grade,gpa\n1001,Alice Johnson,A,3.92\n1002,Bob Martinez,B+,3.45\n1003,Carol Wu,A-,3.78\n1004,David Chen,B,3.21";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "output.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full flex flex-col bg-output-bg border-l border-border">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 h-8 border-b border-border flex-shrink-0">
        <span className="font-mono-code text-[10px] uppercase tracking-widest text-muted-foreground mr-auto">
          Output
        </span>
        <button
          onClick={onClear}
          className="font-mono-code text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          Clear
        </button>
        <button
          onClick={copyOutput}
          className="font-mono-code text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          Copy
        </button>
        <button
          onClick={exportCsv}
          className="font-mono-code text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          CSV
        </button>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-auto custom-scrollbar p-3">
        {output ? (
          <pre className="font-mono-code text-xs text-foreground whitespace-pre leading-relaxed">
            {output}
          </pre>
        ) : (
          <div className="flex items-center justify-center h-full">
            <span className="font-mono-code text-xs text-muted-foreground">
              Run a query to see results
            </span>
          </div>
        )}
      </div>

      {/* Messages */}
      {messages.length > 0 && (
        <div className="border-t border-border px-3 py-2 space-y-1 max-h-32 overflow-y-auto custom-scrollbar flex-shrink-0">
          <span className="font-mono-code text-[10px] uppercase tracking-widest text-muted-foreground">
            Messages
          </span>
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`font-mono-code text-xs py-0.5 pl-2 border-l-2 ${
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
    </div>
  );
};

export default OutputConsole;
