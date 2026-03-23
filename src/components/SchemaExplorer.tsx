import { useState } from "react";

export interface SchemaTable {
  name: string;
  columns: { name: string; type: string }[];
}

interface SchemaExplorerProps {
  tables: SchemaTable[];
}

const SchemaExplorer = ({ tables = [] }: SchemaExplorerProps) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-sidebar-border">
        <span className="font-mono-code text-[10px] uppercase tracking-widest text-muted-foreground">
          Schema
        </span>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar py-1">
        {tables.length === 0 ? (
          <div className="px-3 py-3">
            <span className="font-mono-code text-[10px] text-muted-foreground leading-relaxed">
              No objects yet. Run a CREATE TABLE to see schema here.
            </span>
          </div>
        ) : (
          tables.map((table) => (
            <div key={table.name}>
              <button
                onClick={() => toggle(table.name)}
                className="flex items-center gap-1.5 w-full px-3 py-1.5 text-xs font-mono-code text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors text-left"
              >
                <span className="text-[10px] opacity-50">
                  {expanded.has(table.name) ? "▾" : "▸"}
                </span>
                <span className="opacity-50">▤</span>
                <span className="truncate">{table.name}</span>
              </button>
              {expanded.has(table.name) && (
                <div className="pl-8 pr-3 pb-1">
                  {table.columns.map((col) => (
                    <div
                      key={col.name}
                      className="font-mono-code text-[10px] text-muted-foreground py-0.5 flex gap-2"
                    >
                      <span className="text-sidebar-foreground">{col.name}</span>
                      <span className="opacity-60">{col.type}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default SchemaExplorer;
