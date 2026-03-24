/**
 * sqlEngine.ts
 * Core SQL execution engine. Splits editor content into statements,
 * executes each against the sql.js database, and returns structured results.
 */

import type { Database } from "sql.js";
import { mapSqliteError } from "./oracleErrors";
import { formatTable } from "./tableFormatter";

/** Message displayed in the inline message panel */
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

type SyntheticStatementResult =
  | {
      kind: "message";
      message: OutputMessage;
    }
  | {
      kind: "table";
      message?: OutputMessage;
      columns: string[];
      rows: string[][];
    };

interface ExecuteSQLOptions {
  sessionName?: string;
  lineOffset?: number;
}

interface ParsedStatement {
  text: string;
  line: number;
}

/**
 * Translates common Oracle SQL expressions to SQLite-compatible SQL.
 */
export function translateOracleSql(sql: string): string {
  return sql
    .replace(/\bSYSDATE\s*-\s*(\d+)\b/gi, "DATE('now', '-$1 day')")
    .replace(/\bSYSDATE\s*\+\s*(\d+)\b/gi, "DATE('now', '+$1 day')")
    .replace(/\bSYSDATE\b/gi, "DATE('now')");
}

/**
 * Normalizes SQL text copied from rich editors by replacing hidden spacing chars
 * (NBSP, thin space, zero-width chars) outside quoted strings.
 */
function normalizeSqlText(code: string): string {
  const normalizedLineEndings = code.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  let result = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let i = 0; i < normalizedLineEndings.length; i++) {
    const ch = normalizedLineEndings[i];

    if (ch === "'" && !inDoubleQuote) {
      if (inSingleQuote && i + 1 < normalizedLineEndings.length && normalizedLineEndings[i + 1] === "'") {
        result += "''";
        i++;
        continue;
      }
      inSingleQuote = !inSingleQuote;
      result += ch;
      continue;
    }
    if (ch === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      result += ch;
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote) {
      if (ch === "\u00A0" || ch === "\u2007" || ch === "\u202F") {
        result += " ";
        continue;
      }
      if (
        ch === "\u200B" || ch === "\u200C" || ch === "\u200D" ||
        ch === "\u2060" || ch === "\uFEFF"
      ) {
        continue;
      }
    }

    result += ch;
  }

  return result;
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
 * Ignores semicolons inside single/double quoted strings and BEGIN...END blocks.
 */
function splitStatements(code: string): ParsedStatement[] {
  const normalized = normalizeSqlText(code);
  const statements: ParsedStatement[] = [];
  let current = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let blockDepth = 0;
  let line = 1;
  let statementStartLine = 1;
  let seenNonWhitespace = false;

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];

    if (!seenNonWhitespace && !/\s/.test(ch)) {
      statementStartLine = line;
      seenNonWhitespace = true;
    }

    if (ch === "'" && !inDoubleQuote) {
      // Check for escaped quote ''
      if (inSingleQuote && i + 1 < normalized.length && normalized[i + 1] === "'") {
        current += "''";
        i++;
        continue;
      }
      inSingleQuote = !inSingleQuote;
    } else if (ch === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
    }

    if (!inSingleQuote && !inDoubleQuote && /[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < normalized.length && /[A-Za-z0-9_$]/.test(normalized[j])) j++;
      const token = normalized.slice(i, j).toUpperCase();
      if (token === "BEGIN") {
        blockDepth++;
      } else if (token === "END" && blockDepth > 0) {
        blockDepth--;
      }
      current += normalized.slice(i, j);
      i = j - 1;
      continue;
    }

    if (ch === ";" && !inSingleQuote && !inDoubleQuote && blockDepth === 0) {
      const trimmed = current.trim();
      if (trimmed) {
        statements.push({ text: trimmed, line: statementStartLine });
      }
      current = "";
      seenNonWhitespace = false;
    } else {
      current += ch;
    }

    if (ch === "\n") line++;
  }

  const remaining = current.trim();
  if (remaining) {
    statements.push({ text: remaining, line: seenNonWhitespace ? statementStartLine : line });
  }

  return statements;
}

function stripIdentifierQuotes(value: string): string {
  return value.replace(/^["'`]|["'`]$/g, "");
}

function preprocessStatement(db: Database, statement: string, sessionName: string): SyntheticStatementResult | null {
  const trimmed = statement.trim().replace(/;+\s*$/, "");

  const createDbMatch = trimmed.match(/^CREATE\s+DATABASE\s+([`"']?[\w$]+[`"']?)$/i);
  if (createDbMatch) {
    const name = stripIdentifierQuotes(createDbMatch[1]);
    return {
      kind: "message",
      message: {
        type: "info",
        text: `Database "${name}" created. (BitLab uses per-session databases automatically)`,
      },
    };
  }

  const dropDbMatch = trimmed.match(/^DROP\s+DATABASE\s+([`"']?[\w$]+[`"']?)$/i);
  if (dropDbMatch) {
    const name = stripIdentifierQuotes(dropDbMatch[1]);
    return {
      kind: "message",
      message: { type: "info", text: `Database "${name}" dropped.` },
    };
  }

  const useDbMatch = trimmed.match(/^USE\s+([`"']?[\w$]+[`"']?)$/i);
  if (useDbMatch) {
    const name = stripIdentifierQuotes(useDbMatch[1]);
    return {
      kind: "message",
      message: {
        type: "info",
        text: `Database context switched to "${name}". (Session is already active)`,
      },
    };
  }

  if (/^SHOW\s+DATABASES$/i.test(trimmed)) {
    return {
      kind: "table",
      columns: ["Database"],
      rows: [[sessionName]],
      message: { type: "success", text: "1 row returned." },
    };
  }

  if (/^SHOW\s+TABLES$/i.test(trimmed)) {
    const results = db.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    );
    const rows = results.length > 0 ? results[0].values.map((r) => [String(r[0])]) : [];
    return {
      kind: "table",
      columns: ["Tables"],
      rows,
      message: { type: "success", text: `${rows.length} row${rows.length !== 1 ? "s" : ""} returned.` },
    };
  }

  if (/^ALTER\s+USER\b/i.test(trimmed)) {
    return { kind: "message", message: { type: "success", text: "User altered." } };
  }

  if (/^GRANT\b/i.test(trimmed)) {
    return { kind: "message", message: { type: "success", text: "Grant succeeded." } };
  }

  if (/^REVOKE\b/i.test(trimmed)) {
    return { kind: "message", message: { type: "success", text: "Revoke succeeded." } };
  }

  if (/^CONNECT\b/i.test(trimmed)) {
    return { kind: "message", message: { type: "success", text: "Connected." } };
  }

  return null;
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
export function executeSQL(db: Database, code: string, options: ExecuteSQLOptions = {}): ExecutionResult {
  const messages: OutputMessage[] = [];
  let output: string | null = null;
  let rawResult: { columns: string[]; rows: string[][] } | null = null;
  const sessionName = options.sessionName || "session";
  const lineOffset = options.lineOffset || 0;

  // Run separator
  messages.push({ type: "info", text: `── Run at ${timeStamp()} ──` });

  const statements = splitStatements(code);

  if (statements.length === 0) {
    if (messages.length === 1) { // Only run separator
      messages.push({ type: "info", text: "No statements to execute." });
    }
    return { output, rawResult, messages };
  }

  const startTime = performance.now();
  let lastSelectOutput: string | null = null;
  let lastRawResult: { columns: string[]; rows: string[][] } | null = null;

  for (const parsed of statements) {
    const stmt = parsed.text;
    const lineNo = parsed.line;
    const upperStmt = stmt.trim().toUpperCase();
    try {
      const synthetic = preprocessStatement(db, stmt, sessionName);
      if (synthetic) {
        if (synthetic.kind === "message") {
          messages.push(synthetic.message);
        } else {
          lastSelectOutput = formatTable(synthetic.columns, synthetic.rows);
          lastRawResult = { columns: synthetic.columns, rows: synthetic.rows };
          if (synthetic.message) {
            messages.push(synthetic.message);
          }
        }
        continue;
      }

      if (upperStmt === "COMMIT" || upperStmt === "ROLLBACK") {
        messages.push({ type: "success", text: `${upperStmt === "COMMIT" ? "Commit" : "Rollback"} complete.` });
        continue;
      }
      if (upperStmt.startsWith("SET ")) {
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
        const execStmt = translateOracleSql(stmt);
        const results = db.exec(execStmt);
        if (results.length > 0 && results[0].columns.length > 0) {
          const columns = results[0].columns;
          const rows = results[0].values.map((row) =>
            row.map((v) => (v === null ? "NULL" : String(v)))
          );
          lastSelectOutput = formatTable(columns, rows);
          lastRawResult = { columns, rows };
          messages.push({
            type: "success",
            text: `${rows.length} row${rows.length !== 1 ? "s" : ""} returned.`,
          });
        } else {
          messages.push({ type: "info", text: "Query returned no results." });
        }
      } else if (upperStmt.startsWith("INSERT")) {
        db.run(translateOracleSql(stmt));
        const changes = db.getRowsModified();
        messages.push({
          type: "success",
          text: `${changes} row${changes !== 1 ? "s" : ""} inserted.`,
        });
      } else if (upperStmt.startsWith("UPDATE")) {
        db.run(translateOracleSql(stmt));
        const changes = db.getRowsModified();
        messages.push({
          type: "success",
          text: `${changes} row${changes !== 1 ? "s" : ""} updated.`,
        });
      } else if (upperStmt.startsWith("DELETE")) {
        db.run(translateOracleSql(stmt));
        const changes = db.getRowsModified();
        messages.push({
          type: "success",
          text: `${changes} row${changes !== 1 ? "s" : ""} deleted.`,
        });
      } else {
        // DDL or other
        db.run(translateOracleSql(stmt));
        const ddlMsg = classifyStatement(stmt);
        messages.push({
          type: "success",
          text: ddlMsg || "Statement executed successfully.",
        });
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      
      if (
        upperStmt.startsWith("CREATE TABLE") &&
        /(foreign key|no such table|references)/i.test(errMsg)
      ) {
        messages.push({
          type: "error",
          text: `Line ${lineNo + lineOffset}: ORA-02270: no matching unique or primary key for this column-list (referenced table may not exist yet — create parent table first)`,
        });
      } else {
        messages.push({
          type: "error",
          text: `Line ${lineNo + lineOffset}: ${mapSqliteError(errMsg)}`,
        });
      }
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
