import { useState } from "react";
import { Pencil } from "lucide-react";
import type { Session } from "@/pages/BitLab";
import SchemaExplorer, { type SchemaTable } from "./SchemaExplorer";

interface SessionSidebarProps {
  sessions: Session[];
  activeId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  schemaTables: SchemaTable[];
}

const SessionSidebar = ({ sessions, activeId, onSelect, onAdd, onRename, schemaTables }: SessionSidebarProps) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const startEdit = (session: Session) => {
    setEditingId(session.id);
    setEditValue(session.name);
  };

  const commitEdit = () => {
    if (editingId && editValue.trim()) {
      onRename(editingId, editValue.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="h-full flex flex-col bg-sidebar border-r border-sidebar-border">
      {/* Sessions - top half */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="px-3 py-2 border-b border-sidebar-border">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
            Sessions
          </span>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar py-1">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`group flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors text-sm ${
                session.id === activeId
                  ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-2 border-accent"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50 border-l-2 border-transparent"
              }`}
              onClick={() => onSelect(session.id)}
              onDoubleClick={() => startEdit(session)}
            >
              <span className="text-xs opacity-50">◇</span>
              {editingId === session.id ? (
                <input
                  className="bg-transparent border-b border-accent text-foreground text-sm outline-none flex-1 min-w-0"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitEdit();
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  autoFocus
                />
              ) : (
                <>
                  <span className="truncate text-xs flex-1">{session.name}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); startEdit(session); }}
                    className="text-muted-foreground hover:text-accent transition-opacity opacity-50 hover:opacity-100"
                    title="Rename"
                  >
                    <Pencil size={12} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
        <div className="border-t border-sidebar-border p-2">
          <button
            onClick={onAdd}
            className="w-full text-left px-3 py-1.5 text-xs text-muted-foreground hover:text-accent transition-colors"
          >
            + New Session
          </button>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-border flex-shrink-0" />

      {/* Schema Explorer - bottom half */}
      <div className="flex-1 flex flex-col min-h-0">
        <SchemaExplorer tables={schemaTables} />
      </div>
    </div>
  );
};

export default SessionSidebar;
