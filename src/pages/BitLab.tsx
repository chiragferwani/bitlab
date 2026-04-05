import { useState, useEffect, useCallback } from "react";
import type { Database } from "sql.js";
import type { MutableRefObject } from "react";
import TopBar from "@/components/TopBar";
import SessionSidebar from "@/components/SessionSidebar";
import CodeEditorPanel from "@/components/CodeEditorPanel";
import OutputConsole from "@/components/OutputConsole";
import type { SchemaDatabase } from "@/components/SchemaExplorer";
import type { SchemaTableInfo } from "@/lib/database";
import { executeSQL } from "@/lib/sqlEngine";
import { executePLSQL } from "@/lib/plsqlInterpreter";
import { detectMode } from "@/lib/keywords";
import { formatCsv, formatTable } from "@/lib/tableFormatter";
import { MongoEngine } from "@/lib/mongoEngine";

export interface Session {
  id: string;
  name: string;
  code: string;
  mode: "SQL" | "PL/SQL" | "MONGODB";
}

interface BitLabProps {
  sessions: Session[];
  setSessions: React.Dispatch<React.SetStateAction<Session[]>>;
  activeId: string;
  setActiveId: React.Dispatch<React.SetStateAction<string>>;
  dbMapRef: MutableRefObject<Map<string, Database>>;
  procsMapRef: MutableRefObject<Map<string, Map<string, any>>>;
  databaseNameMapRef: MutableRefObject<Map<string, string>>;
  mongoMapRef: MutableRefObject<Map<string, MongoEngine>>;
  introspectSchema: (db: Database) => SchemaTableInfo[];
}

function inferActiveDatabaseNameFromMessages(
  currentName: string,
  messages: Array<{ type: "success" | "error" | "info" | "dbms"; text: string }>
): string {
  let nextName = currentName;
  for (const message of messages) {
    const useMatch = message.text.match(/^Database context switched to "([^"]+)"/i);
    if (useMatch) {
      nextName = useMatch[1];
      continue;
    }
    const dropMatch = message.text.match(/^Database "([^"]+)" dropped\./i);
    if (dropMatch && dropMatch[1] === nextName) {
      nextName = "session";
    }
  }
  return nextName;
}

import { createDatabase } from "@/lib/database";

function normalizeQuotes(sql: string): string {
  return sql
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'") // single smart quotes → '
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"') // double smart quotes → "
    .replace(/[\u2014]/g, '--')   // em dash → double dash (SQL comment)
    .replace(/[\u2013]/g, '-')    // en dash → hyphen
}

const BitLab = ({
  sessions,
  setSessions,
  activeId,
  setActiveId,
  dbMapRef,
  procsMapRef,
  databaseNameMapRef,
  mongoMapRef,
  introspectSchema,
}: BitLabProps) => {
  const [output, setOutput] = useState<string | null>(null);
  const [messages, setMessages] = useState<Array<{ type: "success" | "error" | "info" | "dbms"; text: string }>>([]);
  const [bootVisible, setBootVisible] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(200);
  const [outputWidth, setOutputWidth] = useState(340);
  const [schemaDatabases, setSchemaDatabases] = useState<SchemaDatabase[]>([]);
  const [selectedTableKey, setSelectedTableKey] = useState<string | null>(null);

  // Raw result for CSV export
  const [rawResult, setRawResult] = useState<{ columns: string[]; rows: string[][] } | null>(null);

  const activeSession = sessions.find((s) => s.id === activeId) || sessions[0];

  useEffect(() => {
    const timer = setTimeout(() => setBootVisible(false), 4000);
    return () => clearTimeout(timer);
  }, []);

  // Refresh schema for the initial session on first mount
  useEffect(() => {
    if (sessions.length > 0 && activeId) {
      refreshSchema(activeId);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const updateSession = (id: string, updates: Partial<Session>) => {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  };

  const refreshSchema = (sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId);
    if (session?.mode === "MONGODB") {
      const mongo = mongoMapRef.current.get(sessionId);
      if (!mongo) {
          setSchemaDatabases([]);
          return;
      }
      const collections = mongo.getCollections();
      // We'll adapt SchemaDatabase to show Collections as tables
      setSchemaDatabases([{
          name: "COLLECTIONS",
          tables: collections.map(c => ({
              name: c.name,
              columns: [{ name: `${c.count} docs`, type: "" }]
          }))
      }]);
      return;
    }

    const db = dbMapRef.current.get(sessionId);
    if (!db) {
      setSchemaDatabases([]);
      return;
    }
    const schema = introspectSchema(db);
    const databaseName = databaseNameMapRef.current.get(sessionId) || "session";
    setSchemaDatabases([{ name: databaseName, tables: schema }]);
  };

  const addSession = () => {
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
    databaseNameMapRef.current.set(newId, "session");
    mongoMapRef.current.set(newId, new MongoEngine());
    setSessions((prev) => [...prev, newSession]);
    setActiveId(newId);
    setSelectedTableKey(null);
    refreshSchema(newId);
  };

  const deleteSession = () => {
    if (sessions.length <= 1) return;
    // Close the DB for the deleted session
    const db = dbMapRef.current.get(activeId);
    if (db) {
      try {
        db.close();
      } catch {
        // ignore close failures
      }
      dbMapRef.current.delete(activeId);
    }
    procsMapRef.current.delete(activeId);
    databaseNameMapRef.current.set(activeId, "session"); // or delete it? the original code has .delete but let's be safe
    mongoMapRef.current.delete(activeId);
    const remaining = sessions.filter((s) => s.id !== activeId);
    setSessions(remaining);
    setActiveId(remaining[0].id);
    setSelectedTableKey(null);
    setOutput(null);
    setMessages([]);
    setRawResult(null);
    // Refresh schema for the new active session
    refreshSchema(remaining[0].id);
  };

  const handleSelectSession = useCallback((id: string) => {
    setActiveId(id);
    setSelectedTableKey(null);
    setOutput(null);
    setMessages([]);
    setRawResult(null);
    // Refresh schema for the selected session
    refreshSchema(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCodeChange = useCallback((code: string) => {
    updateSession(activeId, { code });
    // Auto-detect mode
    const mode = detectMode(code);
    updateSession(activeId, { code, mode });
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectSchemaTable = useCallback((databaseName: string, tableName: string) => {
    const db = dbMapRef.current.get(activeId);
    if (!db) return;

    const safeTableName = tableName.replace(/"/g, "\"\"");
    const sql = `SELECT * FROM "${safeTableName}" LIMIT 200`;

    try {
      const results = db.exec(sql);
      if (results.length === 0 || results[0].columns.length === 0) {
        setOutput(null);
        setRawResult(null);
        setMessages((prev) => [...prev, { type: "info", text: `No rows in ${databaseName}.${tableName}.` }]);
      } else {
        const columns = results[0].columns;
        const rows = results[0].values.map((row) => row.map((v) => (v === null ? "NULL" : String(v))));
        setOutput(formatTable(columns, rows));
        setRawResult({ columns, rows });
        setMessages((prev) => [
          ...prev,
          { type: "info", text: `Previewing ${databaseName}.${tableName} (up to 200 rows).` },
          { type: "success", text: `${rows.length} row${rows.length !== 1 ? "s" : ""} returned.` },
        ]);
      }
      setSelectedTableKey(`${databaseName}.${tableName}`);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setMessages((prev) => [...prev, { type: "error", text: `Failed to preview ${tableName}: ${errMsg}` }]);
    }
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const runQuery = useCallback((codeOverride?: string) => {
    const session = sessions.find((s) => s.id === activeId);
    if (!session) return;
    const raw = (codeOverride ?? session.code).trim();
    if (!raw) return;

    const code = normalizeQuotes(raw);

    const db = dbMapRef.current.get(activeId);

    if (!db) {
      setMessages([{ type: "error", text: "Database not initialized for this session." }]);
      return;
    }

    const mode = detectMode(code);

    try {
      if (mode === "MONGODB") {
          const mongo = mongoMapRef.current.get(activeId);
          if (!mongo) throw new Error("Mongo engine not initialized");
          const result = mongo.execute(code);
          if (result.type === "error") {
              setMessages(prev => [...prev, { type: "error", text: result.message! }]);
          } else if (result.type === "documents" || result.type === "document") {
              const docs = result.type === "documents" ? result.documents : [result.document];
              setOutput(JSON.stringify(docs, null, 2));
              setMessages(prev => [...prev, { type: "success", text: `${result.count || (result.document ? 1 : 0)} documents returned.` }]);
          } else {
              setOutput(result.message || "Command acknowledged.");
              setMessages(prev => [...prev, { type: "success", text: result.message || "Success." }]);
          }
      } else if (mode === "PL/SQL") {
        // PL/SQL execution
        const procs = procsMapRef.current.get(activeId) || new Map();
        const result = executePLSQL(db, code, procs);
        procsMapRef.current.set(activeId, procs);

        let finalOutput = "";
        if (result.output.length > 0) {
          finalOutput += "DBMS_OUTPUT:\n" + result.output.join("\n") + "\n\n";
        }
        if (result.sqlOutput) {
          finalOutput += result.sqlOutput;
        }
        setOutput(finalOutput.trim() || null);
        setRawResult(result.rawResult ?? null);

        // Flush DBMS_OUTPUT to messages panel as well
        if (result.output.length > 0) {
          const dbmsMessages = result.output.map((line) => ({
            type: "dbms" as const,
            text: `DBMS_OUTPUT: ${line}`,
          }));
          setMessages((prev) => [...prev, ...dbmsMessages]);
        }

        if (result.messages.length > 0) {
          setMessages((prev) => [...prev, ...result.messages]);
        }
      } else {
        // SQL execution
        const currentDatabaseName = databaseNameMapRef.current.get(activeId) || "session";
        const result = executeSQL(db, code, {
          sessionName: session.name,
          databaseName: currentDatabaseName,
        });
        setOutput(result.output);
        setRawResult(result.rawResult);
        setMessages((prev) => [...prev, ...result.messages]);

        const inferredDatabaseName = inferActiveDatabaseNameFromMessages(currentDatabaseName, result.messages);
        databaseNameMapRef.current.set(activeId, inferredDatabaseName);
      }
    } finally {
      setSelectedTableKey(null);
      // Refresh schema after every execution batch, even when statements error
      refreshSchema(activeId);
    }
  }, [sessions, activeId]); // eslint-disable-line react-hooks/exhaustive-deps

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
      <TopBar
        onDelete={deleteSession}
        canDelete={sessions.length > 1}
        bootVisible={bootVisible}
        mode={activeSession.mode}
        onModeChange={(mode) => updateSession(activeId, { mode })}
      />
      <div className="flex flex-1 overflow-hidden">
        <div style={{ width: sidebarWidth, minWidth: 140 }} className="flex-shrink-0">
          <SessionSidebar
            sessions={sessions}
            activeId={activeId}
            onSelect={handleSelectSession}
            onAdd={addSession}
            onRename={(id, name) => updateSession(id, { name })}
            schemaDatabases={schemaDatabases}
            selectedTableKey={selectedTableKey}
            onSelectTable={handleSelectSchemaTable}
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
            mode={activeSession.mode}
          />
        </div>
      </div>
    </div>
  );
};

export default BitLab;
