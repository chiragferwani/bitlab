/**
 * database.ts
 * Manages sql.js initialization and per-session database instances.
 * Each session gets its own isolated SQLite database running in the browser.
 */

import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";

// Singleton reference to the sql.js library once initialized
let SQL: SqlJsStatic | null = null;

/**
 * Initializes the sql.js WASM library. Call once on app mount.
 * Uses the local WASM binary served from the public folder.
 */
export async function initDatabase(): Promise<void> {
  if (SQL) return;
  SQL = await initSqlJs({
    locateFile: () => `/sql-wasm.wasm`,
  });
}

/**
 * Creates a new isolated sql.js Database instance.
 * Each session should call this to get its own DB.
 */
export function createDatabase(): Database {
  if (!SQL) throw new Error("sql.js not initialized. Call initDatabase() first.");
  const db = new SQL.Database();
  db.run("PRAGMA foreign_keys = ON");
  return db;
}

/**
 * Schema introspection types
 */
export interface SchemaColumn {
  name: string;
  type: string;
}

export interface SchemaTableInfo {
  name: string;
  columns: SchemaColumn[];
}

/**
 * SQLite type to Oracle-style display type mapping.
 */
function mapType(sqliteType: string): string {
  const upper = (sqliteType || "").toUpperCase().trim();
  if (!upper) return "VARCHAR2";
  if (upper.includes("INT")) return "NUMBER";
  if (upper.includes("REAL") || upper.includes("FLOAT") || upper.includes("DOUBLE")) return "NUMBER";
  if (upper.includes("CHAR") || upper.includes("TEXT") || upper.includes("CLOB") || upper.includes("VARCHAR")) {
    // Preserve VARCHAR2 if already set, otherwise map to VARCHAR2
    if (upper.includes("VARCHAR2")) return upper;
    return "VARCHAR2";
  }
  if (upper.includes("BLOB") || upper.includes("RAW")) return "RAW";
  if (upper.includes("DATE") || upper.includes("TIME")) return "DATE";
  if (upper.includes("BOOL")) return "NUMBER(1)";
  if (upper === "NUMBER" || upper.startsWith("NUMBER(")) return upper;
  if (upper.startsWith("NUMERIC") || upper.startsWith("DECIMAL")) return "NUMBER";
  return upper; // fallback: keep original
}

/**
 * Introspects the sql.js database and returns the full schema tree.
 * Queries sqlite_master for tables and PRAGMA table_info for columns.
 */
export function introspectSchema(db: Database): SchemaTableInfo[] {
  const tables: SchemaTableInfo[] = [];

  try {
    const result = db.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    );
    if (result.length === 0 || result[0].values.length === 0) return [];

    for (const row of result[0].values) {
      const tableName = String(row[0]);
      const columns: SchemaColumn[] = [];

      try {
        const colResult = db.exec(`PRAGMA table_info("${tableName}")`);
        if (colResult.length > 0) {
          for (const colRow of colResult[0].values) {
            columns.push({
              name: String(colRow[1]),      // column name
              type: mapType(String(colRow[2])), // mapped type
            });
          }
        }
      } catch {
        // Failed to get columns for this table — skip
      }

      tables.push({ name: tableName, columns });
    }
  } catch {
    // No tables or error — return empty
  }

  return tables;
}

/**
 * Checks if the sql.js library has been initialized.
 */
export function isDatabaseReady(): boolean {
  return SQL !== null;
}
