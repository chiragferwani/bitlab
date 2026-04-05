import { useState, useEffect, useRef } from "react";
import type { Database } from "sql.js";
import LandingPage from "./pages/LandingPage";
import BitLab, { type Session } from "./pages/BitLab";
import VideoLoader from "./components/VideoLoader";
import { initDatabase, createDatabase, introspectSchema } from "./lib/database";
import { MongoEngine } from "./lib/mongoEngine";

const App = () => {
  const [loading, setLoading] = useState(true);
  const [started, setStarted] = useState(false);

  // sql.js state hoisted to app root so it initializes immediately on app load
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState("");
  const [dbReady, setDbReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const dbMapRef = useRef<Map<string, Database>>(new Map());
  const procsMapRef = useRef<Map<string, Map<string, any>>>(new Map());
  const databaseNameMapRef = useRef<Map<string, string>>(new Map());
  const mongoMapRef = useRef<Map<string, MongoEngine>>(new Map());

  // Start sql.js initialization immediately — before user even clicks Get Started
  useEffect(() => {
    const initTimeout = setTimeout(() => {
      setInitError("Initialization timed out. The WASM engine could not be loaded.");
    }, 10000); // 10 second timeout

    initDatabase()
      .then(() => {
        clearTimeout(initTimeout);
        const defaultId = crypto.randomUUID();
        const db = createDatabase();
        dbMapRef.current.set(defaultId, db);
        procsMapRef.current.set(defaultId, new Map());
        databaseNameMapRef.current.set(defaultId, "session");
        mongoMapRef.current.set(defaultId, new MongoEngine());
        setSessions([{ id: defaultId, name: "query_01.sql", code: "", mode: "SQL" }]);
        setActiveId(defaultId);
        setDbReady(true);
        console.log("[App] sql.js initialized, database ready.");
      })
      .catch((err) => {
        clearTimeout(initTimeout);
        console.error("[App] Failed to initialize sql.js:", err);
        setInitError(`Failed to initialize database engine: ${err.message}`);
      });

    return () => clearTimeout(initTimeout);
  }, []);

  if (loading) {
    return <VideoLoader onComplete={() => setLoading(false)} />;
  }

  return (
    <>
      {!started && <LandingPage onEnter={() => setStarted(true)} />}
      {started && (
        dbReady ? (
          <div className="animate-[fadeSlideIn_0.5s_ease-out]">
            <BitLab
              sessions={sessions}
              setSessions={setSessions}
              activeId={activeId}
              setActiveId={setActiveId}
              dbMapRef={dbMapRef}
              procsMapRef={procsMapRef}
              databaseNameMapRef={databaseNameMapRef}
              mongoMapRef={mongoMapRef}
              introspectSchema={introspectSchema}
            />
          </div>
        ) : initError ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            background: '#0d1117',
            color: '#f85149',
            fontFamily: 'monospace',
            fontSize: '13px',
            gap: '12px'
          }}>
            <span>⚠ BitLab failed to initialize</span>
            <span style={{ color: '#8b949e', fontSize: '11px' }}>{initError}</span>
            <button
              onClick={() => window.location.reload()}
              style={{
                marginTop: '8px',
                padding: '6px 16px',
                background: 'transparent',
                border: '1px solid #30363d',
                color: '#e6edf3',
                borderRadius: '6px',
                cursor: 'pointer',
                fontFamily: 'monospace'
              }}
            >
              Retry
            </button>
          </div>
        ) : (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100vh",
            background: "#0d1117",
            color: "#8b949e",
            fontFamily: "monospace",
            fontSize: "13px"
          }}>
            Initializing BitLab engine...
          </div>
        )
      )}
    </>
  );
};

export default App;
