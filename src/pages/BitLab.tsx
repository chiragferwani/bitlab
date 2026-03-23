import { useState, useEffect } from "react";
import TopBar from "@/components/TopBar";
import SessionSidebar from "@/components/SessionSidebar";
import CodeEditorPanel from "@/components/CodeEditorPanel";
import OutputConsole from "@/components/OutputConsole";

export interface Session {
  id: string;
  name: string;
  code: string;
  mode: "SQL" | "PL/SQL";
}

const defaultSession: Session = {
  id: "1",
  name: "query_01.sql",
  code: "SELECT * FROM students\nWHERE grade >= 'B'\nORDER BY name ASC;",
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

  const activeSession = sessions.find((s) => s.id === activeId) || sessions[0];

  useEffect(() => {
    const timer = setTimeout(() => setBootVisible(false), 4000);
    return () => clearTimeout(timer);
  }, []);

  const updateSession = (id: string, updates: Partial<Session>) => {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
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
    setSessions((prev) => [...prev, newSession]);
    setActiveId(newId);
  };

  const deleteSession = () => {
    if (sessions.length <= 1) return;
    const remaining = sessions.filter((s) => s.id !== activeId);
    setSessions(remaining);
    setActiveId(remaining[0].id);
    setOutput(null);
    setMessages([]);
  };

  const runQuery = () => {
    const code = activeSession.code.trim();
    if (!code) return;

    // Fake output
    const table = `┌────────┬──────────────────┬───────┬───────────┐
│ id     │ name             │ grade │ gpa       │
├────────┼──────────────────┼───────┼───────────┤
│ 1001   │ Alice Johnson    │ A     │ 3.92      │
│ 1002   │ Bob Martinez     │ B+    │ 3.45      │
│ 1003   │ Carol Wu         │ A-    │ 3.78      │
│ 1004   │ David Chen       │ B     │ 3.21      │
└────────┴──────────────────┴───────┴───────────┘`;
    setOutput(table);
    setMessages([
      { type: "success", text: "Query executed successfully." },
      { type: "info", text: "4 rows returned in 0.023s" },
      { type: "info", text: "DBMS_OUTPUT: Execution complete." },
    ]);
  };

  const handleResize = (
    side: "left" | "right",
    e: React.MouseEvent
  ) => {
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
      />
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div style={{ width: sidebarWidth, minWidth: 140 }} className="flex-shrink-0">
          <SessionSidebar
            sessions={sessions}
            activeId={activeId}
            onSelect={setActiveId}
            onAdd={addSession}
            onRename={(id, name) => updateSession(id, { name })}
          />
        </div>
        {/* Left resize handle */}
        <div
          className="w-[2px] bg-panel-resize resize-handle cursor-col-resize flex-shrink-0"
          onMouseDown={(e) => handleResize("left", e)}
        />
        {/* Center editor */}
        <div className="flex-1 min-w-0">
          <CodeEditorPanel
            session={activeSession}
            sessions={sessions}
            onCodeChange={(code) => updateSession(activeId, { code })}
            onModeChange={(mode) => updateSession(activeId, { mode })}
            onRun={runQuery}
            onSelectSession={setActiveId}
          />
        </div>
        {/* Right resize handle */}
        <div
          className="w-[2px] bg-panel-resize resize-handle cursor-col-resize flex-shrink-0"
          onMouseDown={(e) => handleResize("right", e)}
        />
        {/* Output panel */}
        <div style={{ width: outputWidth, minWidth: 240 }} className="flex-shrink-0">
          <OutputConsole
            output={output}
            messages={messages}
            onClear={() => { setOutput(null); setMessages([]); }}
          />
        </div>
      </div>
    </div>
  );
};

export default BitLab;
