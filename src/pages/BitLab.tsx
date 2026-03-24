import { useState, useEffect, useRef, useCallback } from "react";
import type { Database } from "sql.js";
import TopBar from "@/components/TopBar";
import SessionSidebar from "@/components/SessionSidebar";
import CodeEditorPanel from "@/components/CodeEditorPanel";
import OutputConsole from "@/components/OutputConsole";
import type { SchemaTable } from "@/components/SchemaExplorer";
import { initDatabase, createDatabase, introspectSchema } from "@/lib/database";
import { executeSQL } from "@/lib/sqlEngine";
import { executePLSQL } from "@/lib/plsqlInterpreter";
import { detectMode } from "@/lib/keywords";
import { formatCsv } from "@/lib/tableFormatter";

export interface Session {
  id: string;
  name: string;
  code: string;
  mode: "SQL" | "PL/SQL";
}

const defaultSession: Session = {
  id: "1",
  name: "query_01.sql",
  code: "",
  mode: "SQL",
};

const BitLab = () => {
  const [sessions, setSessions] = useState<Session[]>([defaultSession]);
  const [activeId, setActiveId] = useState("1");
  const [output, setOutput] = useState<string | null>(null);
  const [messages, setMessages] = useState<Array<{ type: "success" | "error" | "info"; text: string }>>([]);
  const [bootVisible, setBootVisible] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(200);
  const [outputWidth, setOutputWidth] = useState(340);
  const [schemaTables, setSchemaTables] = useState<SchemaTable[]>([]);
  const [dbReady, setDbReady] = useState(false);

  // Per-session database instances
  const dbMapRef = useRef<Map<string, Database>>(new Map());
  // Per-session stored procedures/functions
  const procsMapRef = useRef<Map<string, Map<string, any>>>(new Map());
  // Raw result for CSV export
  const [rawResult, setRawResult] = useState<{ columns: string[]; rows: string[][] } | null>(null);

  const activeSession = sessions.find((s) => s.id === activeId) || sessions[0];

  // Initialize sql.js on mount
  useEffect(() => {
    initDatabase()
      .then(() => {
        // Create DB for default session
        const db = createDatabase();
        dbMapRef.current.set("1", db);
        procsMapRef.current.set("1", new Map());
        setDbReady(true);
        console.log("[BitLab] sql.js initialized, database ready.");
      })
      .catch((err) => {
        console.error("[BitLab] Failed to initialize sql.js:", err);
        setMessages([{ type: "error", text: `Failed to load SQL engine: ${err.message}` }]);
      });
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setBootVisible(false), 4000);
    return () => clearTimeout(timer);
  }, []);

  const updateSession = (id: string, updates: Partial<Session>) => {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  };

  const addSession = () => {
    if (!dbReady) return;
    const newId = String(Date.now());
    const num = sessions.length + 1;
    const newSession: Session = {
      id: newId,
      name: `query_${String(num).padStart(2, "0")}.sql`,
      code: "",
      mode: "SQL",
    };
    // Create isolated DB for this session
    const db = createDatabase();
    dbMapRef.current.set(newId, db);
    procsMapRef.current.set(newId, new Map());
    setSessions((prev) => [...prev, newSession]);
    setActiveId(newId);
  };

  const deleteSession = () => {
    if (sessions.length <= 1) return;
    // Close the DB for the deleted session
    const db = dbMapRef.current.get(activeId);
    if (db) {
      try { db.close(); } catch { /* ignore */ }
      dbMapRef.current.delete(activeId);
    }
    procsMapRef.current.delete(activeId);
    const remaining = sessions.filter((s) => s.id !== activeId);
    setSessions(remaining);
    setActiveId(remaining[0].id);
    setOutput(null);
    setMessages([]);
    setRawResult(null);
    // Refresh schema for the new active session
    refreshSchema(remaining[0].id);
  };

  const refreshSchema = (sessionId: string) => {
    const db = dbMapRef.current.get(sessionId);
    if (db) {
      const schema = introspectSchema(db);
      setSchemaTables(schema);
    } else {
      setSchemaTables([]);
    }
  };

  const handleSelectSession = useCallback((id: string) => {
    setActiveId(id);
    setOutput(null);
    setMessages([]);
    setRawResult(null);
    // Refresh schema for the selected session
    refreshSchema(id);
  }, []);

  const handleCodeChange = useCallback((code: string) => {
    updateSession(activeId, { code });
    // Auto-detect mode
    const mode = detectMode(code);
    updateSession(activeId, { code, mode });
  }, [activeId]);

  const runQuery = useCallback((codeOverride?: string) => {
    const session = sessions.find((s) => s.id === activeId);
    if (!session) return;
    const code = (codeOverride ?? session.code).trim();
    if (!code) return;

    const db = dbMapRef.current.get(activeId);
    if (!db) {
      setMessages([{ type: "error", text: "Database not initialized for this session." }]);
      return;
    }

    const mode = detectMode(code);

    try {
      if (mode === "PL/SQL") {
        // PL/SQL execution
        const procs = procsMapRef.current.get(activeId) || new Map();
        const result = executePLSQL(db, code, procs);
        procsMapRef.current.set(activeId, procs);

        if (result.sqlOutput) {
          setOutput(result.sqlOutput);
          setRawResult(result.rawResult ?? null);
        } else if (result.output.length > 0) {
          // Display DBMS_OUTPUT lines in the output panel when no SQL result set exists
          setOutput("DBMS_OUTPUT:\n" + result.output.join("\n"));
          setRawResult(null);
        } else {
          setOutput(null);
          setRawResult(null);
        }
        setMessages((prev) => [...prev, ...result.messages]);
      } else {
        // SQL execution
        const result = executeSQL(db, code, { sessionName: session.name });
        setOutput(result.output);
        setRawResult(result.rawResult);
        setMessages((prev) => [...prev, ...result.messages]);
      }
    } finally {
      // Refresh schema after every execution batch, even when statements error
      refreshSchema(activeId);
    }
  }, [sessions, activeId]);

  const handleClear = useCallback(() => {
    setOutput(null);
    setMessages([]);
    setRawResult(null);
  }, []);

  const handleExportCsv = useCallback(() => {
    if (!rawResult) return;
    const csv = formatCsv(rawResult.columns, rawResult.rows);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "output.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [rawResult]);

  const handleResize = (side: "left" | "right", e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = side === "left" ? sidebarWidth : outputWidth;

    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      if (side === "left") {
        setSidebarWidth(Math.max(140, Math.min(400, startWidth + delta)));
      } else {
        setOutputWidth(Math.max(240, Math.min(600, startWidth - delta)));
      }
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      <TopBar onDelete={deleteSession} canDelete={sessions.length > 1} bootVisible={bootVisible} />
      <div className="flex flex-1 overflow-hidden">
        <div style={{ width: sidebarWidth, minWidth: 140 }} className="flex-shrink-0">
          <SessionSidebar
            sessions={sessions}
            activeId={activeId}
            onSelect={handleSelectSession}
            onAdd={addSession}
            onRename={(id, name) => updateSession(id, { name })}
            schemaTables={schemaTables}
          />
        </div>
        <div
          className="w-[2px] bg-panel-resize resize-handle cursor-col-resize flex-shrink-0"
          onMouseDown={(e) => handleResize("left", e)}
        />
        <div className="flex-1 min-w-0">
          <CodeEditorPanel
            session={activeSession}
            sessions={sessions}
            onCodeChange={handleCodeChange}
            onModeChange={(mode) => updateSession(activeId, { mode })}
            onRun={runQuery}
            onSelectSession={handleSelectSession}
            messages={messages}
            output={output}
          />
        </div>
        <div
          className="w-[2px] bg-panel-resize resize-handle cursor-col-resize flex-shrink-0"
          onMouseDown={(e) => handleResize("right", e)}
        />
        <div style={{ width: outputWidth, minWidth: 240 }} className="flex-shrink-0">
          <OutputConsole
            output={output}
            onClear={handleClear}
            onExportCsv={handleExportCsv}
            hasRawResult={rawResult !== null}
          />
        </div>
      </div>
    </div>
  );
};

export default BitLab;
