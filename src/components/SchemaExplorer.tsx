import { useState } from "react";

export interface SchemaTable {
  name: string;
  columns: { name: string; type: string }[];
}

export interface SchemaDatabase {
  name: string;
  tables: SchemaTable[];
}

interface SchemaExplorerProps {
  databases: SchemaDatabase[];
  selectedTableKey?: string | null;
  onSelectTable?: (databaseName: string, tableName: string) => void;
}

const SchemaExplorer = ({ databases = [], selectedTableKey = null, onSelectTable }: SchemaExplorerProps) => {
  const [expandedDatabases, setExpandedDatabases] = useState<Set<string>>(new Set());
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());

  const toggleDatabase = (databaseName: string) => {
    setExpandedDatabases((prev) => {
      const next = new Set(prev);
      if (next.has(databaseName)) next.delete(databaseName);
      else next.add(databaseName);
      return next;
    });
  };

  const toggleTable = (tableKey: string) => {
    setExpandedTables((prev) => {
      const next = new Set(prev);
      if (next.has(tableKey)) next.delete(tableKey);
      else next.add(tableKey);
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-sidebar-border">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
          Schema
        </span>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar py-1">
        {databases.length === 0 ? (
          <div className="px-3 py-3">
            <span className="text-[10px] text-muted-foreground leading-relaxed">
              No objects yet. Run a CREATE TABLE to see schema here.
            </span>
          </div>
        ) : (
          databases.map((database) => (
            <div key={database.name}>
              <button
                onClick={() => toggleDatabase(database.name)}
                className="flex items-center gap-1.5 w-full px-3 py-1.5 text-xs text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors text-left font-semibold"
              >
                <span className="text-[10px] opacity-50">
                  {expandedDatabases.has(database.name) ? "▾" : "▸"}
                </span>
                <span className="opacity-50">◈</span>
                <span className="truncate flex-1">{database.name}</span>
              </button>

              {expandedDatabases.has(database.name) && (
                <div>
                  {database.tables.length === 0 ? (
                    <div className="pl-8 pr-3 pb-1 text-[10px] text-muted-foreground">
                      No tables
                    </div>
                  ) : (
                    database.tables.map((table) => {
                      const tableKey = `${database.name}.${table.name}`;
                      return (
                        <div key={tableKey}>
                          <button
                            onClick={() => {
                              toggleTable(tableKey);
                              onSelectTable?.(database.name, table.name);
                            }}
                            className={`flex items-center gap-1.5 w-full pl-8 pr-3 py-1.5 text-xs transition-colors text-left ${
                              selectedTableKey === tableKey
                                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                            }`}
                          >
                            <span className="text-[10px] opacity-50">
                              {expandedTables.has(tableKey) ? "▾" : "▸"}
                            </span>
                            <span className="opacity-50">▤</span>
                            <span className="truncate flex-1">{table.name}</span>
                          </button>
                          {expandedTables.has(tableKey) && (
                            <div className="pl-12 pr-3 pb-1">
                              {table.columns.map((col) => (
                                <div
                                  key={col.name}
                                  className="text-[10px] text-muted-foreground py-0.5 flex gap-2"
                                >
                                  <span className="text-sidebar-foreground">{col.name}</span>
                                  <span className="opacity-60 font-mono-code">{col.type}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
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
