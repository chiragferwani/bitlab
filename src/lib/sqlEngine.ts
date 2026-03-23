/**
 * sqlEngine.ts
 * Core SQL execution engine. Splits editor content into statements,
 * executes each against the sql.js database, and returns structured results.
 */

import type { Database } from "sql.js";
import { mapSqliteError } from "./oracleErrors";
import { formatTable } from "./tableFormatter";

/** Message displayed in the MESSAGES panel */
export interface OutputMessage {
  type: "success" | "error" | "info";
  text: string;
}

/** Result of executing SQL code */
export interface ExecutionResult {
  /** ASCII table string for SELECT results, or null */
  output: string | null;
  /** Raw columns and rows for CSV export */
  rawResult: { columns: string[]; rows: string[][] } | null;
  /** Messages to display */
  messages: OutputMessage[];
}

/**
 * Classify a SQL statement to determine the appropriate response message.
 */
function classifyStatement(sql: string): string {
  const trimmed = sql.trim().toUpperCase();
  if (trimmed.startsWith("CREATE TABLE")) return "Table created.";
  if (trimmed.startsWith("CREATE INDEX")) return "Index created.";
  if (trimmed.startsWith("CREATE VIEW")) return "View created.";
  if (trimmed.startsWith("CREATE TRIGGER")) return "Trigger created.";
  if (trimmed.startsWith("DROP TABLE")) return "Table dropped.";
  if (trimmed.startsWith("DROP INDEX")) return "Index dropped.";
  if (trimmed.startsWith("DROP VIEW")) return "View dropped.";
  if (trimmed.startsWith("DROP TRIGGER")) return "Trigger dropped.";
  if (trimmed.startsWith("ALTER")) return "Table altered.";
  if (trimmed.startsWith("TRUNCATE")) return "Table truncated.";
  return "";
}

/**
 * Splits SQL code into individual statements by semicolons.
 * Handles basic string literal awareness to avoid splitting inside quotes.
 */
function splitStatements(code: string): string[] {
  const statements: string[] = [];
  let current = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let i = 0; i < code.length; i++) {
    const ch = code[i];

    if (ch === "'" && !inDoubleQuote) {
      // Check for escaped quote ''
      if (inSingleQuote && i + 1 < code.length && code[i + 1] === "'") {
        current += "''";
        i++;
        continue;
      }
      inSingleQuote = !inSingleQuote;
    } else if (ch === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
    }

    if (ch === ";" && !inSingleQuote && !inDoubleQuote) {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = "";
    } else {
      current += ch;
    }
  }

  const remaining = current.trim();
  if (remaining) statements.push(remaining);

  return statements;
}

/**
 * Formats the current time as HH:MM:SS.
 */
function timeStamp(): string {
  const now = new Date();
  return now.toLocaleTimeString("en-US", { hour12: false });
}

/**
 * Executes SQL code against the given database.
 * Returns structured results for UI rendering.
 */
export function executeSQL(db: Database, code: string): ExecutionResult {
  const messages: OutputMessage[] = [];
  let output: string | null = null;
  let rawResult: { columns: string[]; rows: string[][] } | null = null;

  // Run separator
  messages.push({ type: "info", text: `── Run at ${timeStamp()} ──` });

  const statements = splitStatements(code);

  if (statements.length === 0) {
    messages.push({ type: "info", text: "No statements to execute." });
    return { output, rawResult, messages };
  }

  const startTime = performance.now();
  let totalRows = 0;
  let lastSelectOutput: string | null = null;
  let lastRawResult: { columns: string[]; rows: string[][] } | null = null;

  for (const stmt of statements) {
    try {
      const upperStmt = stmt.trim().toUpperCase();

      // ── Handle Oracle/MySQL commands not supported in SQLite ──
      // These are commonly used by students but have no SQLite equivalent.
      if (upperStmt.startsWith("CREATE DATABASE")) {
        messages.push({ type: "success", text: "Database created. (Note: BitLab uses per-session databases automatically)" });
        continue;
      }
      if (upperStmt.startsWith("USE ")) {
        messages.push({ type: "success", text: "Database changed. (Note: BitLab uses per-session databases automatically)" });
        continue;
      }
      if (upperStmt.startsWith("GRANT") || upperStmt.startsWith("REVOKE")) {
        messages.push({ type: "success", text: "Statement executed successfully." });
        continue;
      }
      if (upperStmt === "COMMIT" || upperStmt === "ROLLBACK") {
        messages.push({ type: "success", text: `${upperStmt === "COMMIT" ? "Commit" : "Rollback"} complete.` });
        continue;
      }
      if (upperStmt.startsWith("SET ") || upperStmt.startsWith("SHOW ")) {
        messages.push({ type: "info", text: "Statement acknowledged." });
        continue;
      }
      if (upperStmt.startsWith("DESC ") || upperStmt.startsWith("DESCRIBE ")) {
        // Handle DESC/DESCRIBE tablename — show table info via PRAGMA
        const tableName = stmt.trim().replace(/^(DESC|DESCRIBE)\s+/i, "").replace(/;$/, "").trim();
        const results = db.exec(`PRAGMA table_info("${tableName}")`);
        if (results.length > 0 && results[0].values.length > 0) {
          const cols = ["Column", "Type", "Nullable", "Default"];
          const rows = results[0].values.map((r) => [
            String(r[1]), String(r[2] || "VARCHAR2"), r[3] ? "NOT NULL" : "YES", String(r[4] ?? "NULL")
          ]);
          lastSelectOutput = formatTable(cols, rows);
          lastRawResult = { columns: cols, rows };
          messages.push({ type: "success", text: `Table ${tableName} described.` });
        } else {
          messages.push({ type: "error", text: `ORA-00942: table or view does not exist` });
        }
        continue;
      }

      if (upperStmt.startsWith("SELECT") || upperStmt.startsWith("WITH") || upperStmt.startsWith("PRAGMA")) {
        // SELECT / WITH — returns rows
        const results = db.exec(stmt);
        if (results.length > 0 && results[0].columns.length > 0) {
          const columns = results[0].columns;
          const rows = results[0].values.map((row) =>
            row.map((v) => (v === null ? "NULL" : String(v)))
          );
          lastSelectOutput = formatTable(columns, rows);
          lastRawResult = { columns, rows };
          totalRows += rows.length;
          messages.push({
            type: "success",
            text: `${rows.length} row${rows.length !== 1 ? "s" : ""} returned.`,
          });
        } else {
          messages.push({ type: "info", text: "Query returned no results." });
        }
      } else if (upperStmt.startsWith("INSERT")) {
        db.run(stmt);
        const changes = db.getRowsModified();
        messages.push({
          type: "success",
          text: `${changes} row${changes !== 1 ? "s" : ""} inserted.`,
        });
      } else if (upperStmt.startsWith("UPDATE")) {
        db.run(stmt);
        const changes = db.getRowsModified();
        messages.push({
          type: "success",
          text: `${changes} row${changes !== 1 ? "s" : ""} updated.`,
        });
      } else if (upperStmt.startsWith("DELETE")) {
        db.run(stmt);
        const changes = db.getRowsModified();
        messages.push({
          type: "success",
          text: `${changes} row${changes !== 1 ? "s" : ""} deleted.`,
        });
      } else {
        // DDL or other
        db.run(stmt);
        const ddlMsg = classifyStatement(stmt);
        messages.push({
          type: "success",
          text: ddlMsg || "Statement executed successfully.",
        });
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      messages.push({
        type: "error",
        text: mapSqliteError(errMsg),
      });
    }
  }

  const elapsed = ((performance.now() - startTime) / 1000).toFixed(3);
  messages.push({
    type: "info",
    text: `Query executed in ${elapsed}s`,
  });

  // Use the last SELECT output for the output panel
  output = lastSelectOutput;
  rawResult = lastRawResult;

  return { output, rawResult, messages };
}
