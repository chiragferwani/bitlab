/**
 * plsqlInterpreter.ts
 * JavaScript-based PL/SQL interpreter for university DBMS lab coursework.
 * Covers: variables, DBMS_OUTPUT, IF/ELSIF/ELSE, loops (FOR, WHILE, LOOP),
 * cursors, SELECT INTO, DML, stored procedures/functions, and exceptions.
 *
 * This interpreter parses PL/SQL blocks line-by-line and executes them
 * against a sql.js database instance. It is not a full Oracle PL/SQL engine
 * but covers the standard Indian university DBMS lab syllabus.
 */

import type { Database } from "sql.js";
import { mapSqliteError } from "./oracleErrors";
import { executeSQL, translateOracleSql } from "./sqlEngine";

// ── Types ──────────────────────────────────────────────────────────────

export interface PLSQLResult {
  output: string[];        // DBMS_OUTPUT lines
  messages: Array<{ type: "success" | "error" | "info"; text: string }>;
  sqlOutput?: string | null;
  rawResult?: { columns: string[]; rows: string[][] } | null;
}

interface Variable {
  name: string;
  type: string;
  value: unknown;
}

interface CursorParam {
  name: string;
  type: string;
}

interface CursorDef {
  name: string;
  query: string;
  params: CursorParam[];
  rows: unknown[][] | null;
  columns: string[] | null;
  position: number;
  isOpen: boolean;
  lastFetchFound: boolean;
}

interface StoredProgram {
  name: string;
  type: "PROCEDURE" | "FUNCTION";
  params: Array<{ name: string; mode: string; type: string }>;
  body: string;
  returnType?: string;
}

function toOracleErrorText(errMsg: string): string {
  if (/^\s*(ORA-\d+|ERROR:|Line\s+\d+:)/i.test(errMsg)) return errMsg;
  return mapSqliteError(errMsg);
}

// ── Execution Context ──────────────────────────────────────────────────

class ExecutionContext {
  variables: Map<string, Variable> = new Map();
  cursors: Map<string, CursorDef> = new Map();
  dbmsOutput: string[] = [];
  db: Database;
  procedures: Map<string, StoredProgram>;
  exitLoop = false;
  returnValue: unknown = undefined;
  hasReturned = false;

  constructor(db: Database, procedures: Map<string, StoredProgram>) {
    this.db = db;
    this.procedures = procedures;
  }

  setVar(name: string, value: unknown) {
    const upper = name.toUpperCase();
    const existing = this.variables.get(upper);
    if (existing) {
      assignVariable(this.variables, upper, value, existing.type);
    } else {
      assignVariable(this.variables, upper, value, "VARCHAR2");
    }
  }

  getVar(name: string): unknown {
    const upper = name.toUpperCase();
    const v = this.variables.get(upper);
    return v ? v.value : undefined;
  }

  hasVar(name: string): boolean {
    return this.variables.has(name.toUpperCase());
  }
}

/**
 * Coerces variable values based on declared PL/SQL types.
 */
function assignVariable(
  variables: Map<string, Variable>,
  name: string,
  value: any,
  declaredType: string
) {
  const upper = name.toUpperCase();
  const numericTypes = ['NUMBER', 'INTEGER', 'INT', 'FLOAT', 'DECIMAL', 'NUMERIC']
  let finalValue = value;

  if (numericTypes.some(t => declaredType.toUpperCase().startsWith(t))) {
    finalValue = value === null || value === undefined || value === '' ? 0 : Number(value);
    if (isNaN(finalValue)) finalValue = 0;
  }

  const existing = variables.get(upper);
  if (existing) {
    existing.value = finalValue;
  } else {
    variables.set(upper, { name: upper, type: declaredType.toUpperCase(), value: finalValue });
  }
}

function evaluateBetween(value: any, low: any, high: any): boolean {
  return Number(value) >= Number(low) && Number(value) <= Number(high);
}

// ── Expression Evaluator ───────────────────────────────────────────────

/**
 * Evaluates a PL/SQL expression in the current context.
 * Supports: string literals, numbers, variables, ||, arithmetic, comparisons, MOD.
 */
function evaluateExpression(expr: string, ctx: ExecutionContext): unknown {
  let e = expr.trim();
  if (!e) return null;

  // Handle string concatenation with ||
  if (e.includes("||")) {
    const parts = splitByOperator(e, "||");
    return parts.map((p) => String(evaluateExpression(p, ctx) ?? "")).join("");
  }

  // Boolean literals
  if (e.toUpperCase() === "TRUE") return true;
  if (e.toUpperCase() === "FALSE") return false;
  if (e.toUpperCase() === "NULL") return null;

  // String literal
  if ((e.startsWith("'") && e.endsWith("'"))) {
    return e.slice(1, -1).replace(/''/g, "'");
  }

  // Numeric literal
  if (/^-?\d+(\.\d+)?$/.test(e)) {
    return parseFloat(e);
  }

  // SQLERRM special variable
  if (e.toUpperCase() === "SQLERRM") {
    return ctx.getVar("SQLERRM") ?? "No error";
  }
  if (e.toUpperCase() === "SQLCODE") {
    return ctx.getVar("SQLCODE") ?? 0;
  }

  // Cursor attributes: cursor_name%NOTFOUND, %FOUND, %ROWCOUNT, %ISOPEN
  const cursorAttrMatch = e.match(/^(\w+)%(NOTFOUND|FOUND|ROWCOUNT|ISOPEN)$/i);
  if (cursorAttrMatch) {
    const cursorName = cursorAttrMatch[1].toUpperCase();
    const attr = cursorAttrMatch[2].toUpperCase();
    if (cursorName === "SQL") {
      if (attr === "FOUND") return Boolean(ctx.getVar("SQL%FOUND"));
      if (attr === "NOTFOUND") return Boolean(ctx.getVar("SQL%NOTFOUND"));
      return Number(ctx.getVar("SQL%ROWCOUNT") ?? 0);
    }
    const cursor = ctx.cursors.get(cursorName);
    if (!cursor) return null;
    switch (attr) {
      case "NOTFOUND": return cursor.isOpen && !cursor.lastFetchFound;
      case "FOUND": return cursor.isOpen && cursor.lastFetchFound;
      case "ROWCOUNT": return cursor.position;
      case "ISOPEN": return cursor.isOpen;
    }
  }

  // Implicit SQL cursor attributes for last DML statement
  const implicitSqlAttrMatch = e.match(/^SQL%(NOTFOUND|FOUND|ROWCOUNT)$/i);
  if (implicitSqlAttrMatch) {
    const attr = implicitSqlAttrMatch[1].toUpperCase();
    if (attr === "FOUND") return Boolean(ctx.getVar("SQL%FOUND"));
    if (attr === "NOTFOUND") return Boolean(ctx.getVar("SQL%NOTFOUND"));
    return Number(ctx.getVar("SQL%ROWCOUNT") ?? 0);
  }

  // Function call: UPPER(), LOWER(), LENGTH(), TO_CHAR(), etc.
  const funcMatch = e.match(/^(\w+)\s*\(([\s\S]*)\)$/);
  if (funcMatch) {
    const funcName = funcMatch[1].toUpperCase();
    const argsStr = funcMatch[2];
    return evaluateFunction(funcName, argsStr, ctx);
  }

  // Comparison expressions
  const compOps = [" >= ", " <= ", " != ", " <> ", " = ", " > ", " < ",
                   " AND ", " OR ", " BETWEEN "];
  for (const op of compOps) {
    const idx = e.toUpperCase().indexOf(op);
    if (idx !== -1) {
      if (op.trim().toUpperCase() === "BETWEEN") {
        const valExpr = e.substring(0, idx).trim();
        const rangeExpr = e.substring(idx + op.length).trim();
        const andIdx = rangeExpr.toUpperCase().indexOf(" AND ");
        if (andIdx !== -1) {
          const lowExpr = rangeExpr.substring(0, andIdx).trim();
          const highExpr = rangeExpr.substring(andIdx + 5).trim();
          const val = evaluateExpression(valExpr, ctx);
          const low = evaluateExpression(lowExpr, ctx);
          const high = evaluateExpression(highExpr, ctx);
          return evaluateBetween(val, low, high);
        }
      }
      const left = evaluateExpression(e.substring(0, idx), ctx);
      const right = evaluateExpression(e.substring(idx + op.length), ctx);
      return evaluateComparison(left, right, op.trim().toUpperCase());
    }
  }

  // NOT prefix
  if (e.toUpperCase().startsWith("NOT ")) {
    const val = evaluateExpression(e.substring(4), ctx);
    return !val;
  }

  // IS NULL / IS NOT NULL
  const isNullMatch = e.match(/^(.+?)\s+IS\s+NOT\s+NULL$/i);
  if (isNullMatch) {
    return evaluateExpression(isNullMatch[1], ctx) !== null;
  }
  const isNullMatch2 = e.match(/^(.+?)\s+IS\s+NULL$/i);
  if (isNullMatch2) {
    return evaluateExpression(isNullMatch2[1], ctx) === null;
  }

  // Arithmetic: +, -, *, /, MOD
  // Handle in order of precedence (low to high): +/-, *//, MOD
  for (const op of [" + ", " - "]) {
    const idx = findOperator(e, op);
    if (idx !== -1) {
      const left = Number(evaluateExpression(e.substring(0, idx), ctx));
      const right = Number(evaluateExpression(e.substring(idx + op.length), ctx));
      return op.trim() === "+" ? left + right : left - right;
    }
  }
  for (const op of [" * ", " / "]) {
    const idx = findOperator(e, op);
    if (idx !== -1) {
      const left = Number(evaluateExpression(e.substring(0, idx), ctx));
      const right = Number(evaluateExpression(e.substring(idx + op.length), ctx));
      return op.trim() === "*" ? left * right : left / right;
    }
  }
  const modMatch = e.match(/^(.+?)\s+MOD\s+(.+)$/i);
  if (modMatch) {
    const left = Number(evaluateExpression(modMatch[1], ctx));
    const right = Number(evaluateExpression(modMatch[2], ctx));
    return left % right;
  }

  // Parenthesized expression
  if (e.startsWith("(") && e.endsWith(")")) {
    return evaluateExpression(e.slice(1, -1), ctx);
  }

  // Variable reference
  if (/^\w+$/.test(e) && ctx.hasVar(e)) {
    return ctx.getVar(e);
  }

  // If it looks like an identifier, try as variable
  if (/^[\w.]+$/.test(e)) {
    const val = ctx.getVar(e);
    if (val !== undefined) return val;
  }

  return e; // fallback: return as-is
}

function evaluateComparison(left: unknown, right: unknown, op: string): boolean {
  const l = left === null ? null : (typeof left === "number" ? left : String(left));
  const r = right === null ? null : (typeof right === "number" ? right : String(right));
  switch (op) {
    case "=": return l === r;
    case "!=": case "<>": return l !== r;
    case ">": return (l as number) > (r as number);
    case "<": return (l as number) < (r as number);
    case ">=": return (l as number) >= (r as number);
    case "<=": return (l as number) <= (r as number);
    case "AND": return Boolean(left) && Boolean(right);
    case "OR": return Boolean(left) || Boolean(right);
    default: return false;
  }
}

function evaluateFunction(name: string, argsStr: string, ctx: ExecutionContext): unknown {
  const args = splitFunctionArgs(argsStr).map((a) => evaluateExpression(a, ctx));
  switch (name) {
    case "UPPER": return String(args[0] ?? "").toUpperCase();
    case "LOWER": return String(args[0] ?? "").toLowerCase();
    case "LENGTH": return String(args[0] ?? "").length;
    case "SUBSTR": {
      const str = String(args[0] ?? "");
      const start = Number(args[1] ?? 1) - 1; // Oracle is 1-based
      const len = args[2] !== undefined ? Number(args[2]) : undefined;
      return len !== undefined ? str.substring(start, start + len) : str.substring(start);
    }
    case "TRIM": return String(args[0] ?? "").trim();
    case "LTRIM": return String(args[0] ?? "").replace(/^\s+/, "");
    case "RTRIM": return String(args[0] ?? "").replace(/\s+$/, "");
    case "REPLACE": return String(args[0] ?? "").replace(new RegExp(String(args[1] ?? "").replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), String(args[2] ?? ""));
    case "INSTR": return String(args[0] ?? "").indexOf(String(args[1] ?? "")) + 1;
    case "LPAD": {
      const s = String(args[0] ?? ""); const len = Number(args[1] ?? 0); const pad = String(args[2] ?? " ");
      return s.padStart(len, pad);
    }
    case "RPAD": {
      const s = String(args[0] ?? ""); const len = Number(args[1] ?? 0); const pad = String(args[2] ?? " ");
      return s.padEnd(len, pad);
    }
    case "TO_CHAR": return String(args[0] ?? "");
    case "TO_NUMBER": return Number(args[0] ?? 0);
    case "TO_DATE": return String(args[0] ?? "");
    case "NVL": return args[0] === null || args[0] === undefined ? args[1] : args[0];
    case "NVL2": return args[0] !== null && args[0] !== undefined ? args[1] : args[2];
    case "COALESCE": return args.find((a) => a !== null && a !== undefined) ?? null;
    case "ABS": return Math.abs(Number(args[0] ?? 0));
    case "CEIL": return Math.ceil(Number(args[0] ?? 0));
    case "FLOOR": return Math.floor(Number(args[0] ?? 0));
    case "ROUND": return Number(Number(args[0] ?? 0).toFixed(Number(args[1] ?? 0)));
    case "TRUNC": return Math.trunc(Number(args[0] ?? 0));
    case "MOD": return Number(args[0] ?? 0) % Number(args[1] ?? 1);
    case "POWER": return Math.pow(Number(args[0] ?? 0), Number(args[1] ?? 0));
    case "SQRT": return Math.sqrt(Number(args[0] ?? 0));
    case "GREATEST": return Math.max(...args.map(Number));
    case "LEAST": return Math.min(...args.map(Number));
    case "CONCAT": return args.map(String).join("");
    case "SYSDATE": case "CURRENT_DATE": return new Date().toISOString().split("T")[0];
    default: return null;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

function splitByOperator(expr: string, op: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inStr = false;
  let current = "";
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (ch === "'" && !inStr) { inStr = true; current += ch; continue; }
    if (ch === "'" && inStr) { inStr = false; current += ch; continue; }
    if (inStr) { current += ch; continue; }
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (depth === 0 && expr.substring(i, i + op.length) === op) {
      parts.push(current);
      current = "";
      i += op.length - 1;
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

function splitFunctionArgs(argsStr: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let inStr = false;
  let current = "";
  for (const ch of argsStr) {
    if (ch === "'" && !inStr) { inStr = true; current += ch; continue; }
    if (ch === "'" && inStr) { inStr = false; current += ch; continue; }
    if (inStr) { current += ch; continue; }
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      args.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

function findOperator(expr: string, op: string): number {
  let depth = 0;
  let inStr = false;
  for (let i = expr.length - 1; i >= 0; i--) {
    const ch = expr[i];
    if (ch === "'") inStr = !inStr;
    if (inStr) continue;
    if (ch === ")") depth++;
    if (ch === "(") depth--;
    if (depth === 0 && expr.substring(i, i + op.length) === op) return i;
  }
  return -1;
}

// ── Block Parser ───────────────────────────────────────────────────────

/**
 * Collects lines between start and a matching END keyword.
 * Handles nested BEGIN..END blocks.
 */
function collectBlock(lines: string[], startIdx: number, endKeyword: RegExp): { blockLines: string[]; endIdx: number } {
  const blockLines: string[] = [];
  let depth = 0;
  let i = startIdx;
  while (i < lines.length) {
    const line = lines[i].trim().toUpperCase();
    if (/^BEGIN\b/.test(line)) depth++;
    if (/^END\s*;?\s*$/.test(line) || endKeyword.test(line)) {
      if (depth > 0) {
        depth--;
        if (depth < 0) break;
        blockLines.push(lines[i]);
      } else {
        break;
      }
    } else {
      blockLines.push(lines[i]);
    }
    i++;
  }
  return { blockLines, endIdx: i };
}

// ── DECLARE Section Parser ─────────────────────────────────────────────

/**
 * Resolves a column's type from the database schema for %TYPE declarations.
 */
function resolvePercentType(
  table: string,
  column: string,
  db: Database
): string {
  try {
    const result = db.exec(`PRAGMA table_info(${table})`);
    if (result.length > 0) {
      const col = result[0].values.find(
        (row: any[]) => row[1].toString().toLowerCase() === column.toLowerCase()
      );
      if (col) {
        const type = String(col[2]).toUpperCase();
        if (type.includes('NUMBER') || type.includes('INT') ||
            type.includes('FLOAT') || type.includes('REAL') ||
            type.includes('DECIMAL') || type.includes('NUMERIC')) {
          return 'NUMBER';
        }
        if (type.includes('DATE')) return 'DATE';
        return 'VARCHAR2';
      }
    }
  } catch {}
  return 'NUMBER'; // default to NUMBER if lookup fails
}

function parseDeclareSection(lines: string[], ctx: ExecutionContext) {
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    const line = raw.replace(/;$/, "").trim();
    if (!line || line.toUpperCase() === "DECLARE") continue;

    // Cursor declaration with parameters: CURSOR c1(p1 TYPE, p2 TYPE) IS SELECT ...
    const cursorParamMatch = raw.match(/^CURSOR\s+(\w+)\s*\(([^)]+)\)\s+IS\b([\s\S]*)$/i);
    if (cursorParamMatch) {
      const cursorName = cursorParamMatch[1].toUpperCase();
      const paramsStr = cursorParamMatch[2];
      const cursorParams: CursorParam[] = [];

      // Parse parameter list: p_dno NUMBER, p_name VARCHAR2, etc.
      const paramParts = paramsStr.split(',');
      for (const p of paramParts) {
        const pm = p.trim().match(/^(\w+)\s+(\w+(?:\([^)]*\))?)$/i);
        if (pm) {
          cursorParams.push({ name: pm[1].toUpperCase(), type: pm[2].toUpperCase() });
        }
      }

      const queryParts: string[] = [];
      let j = i;

      const firstTail = (cursorParamMatch[3] || "").trim().replace(/;$/, "");
      if (firstTail) {
        queryParts.push(firstTail);
      }

      if (!raw.endsWith(";")) {
        j = i + 1;
        while (j < lines.length) {
          const partRaw = lines[j].trim();
          if (!partRaw) {
            j++;
            continue;
          }
          queryParts.push(partRaw.replace(/;$/, "").trim());
          if (partRaw.endsWith(";")) break;
          j++;
        }
      }

      ctx.cursors.set(cursorName, {
        name: cursorName,
        query: queryParts.join(" ").trim(),
        params: cursorParams,
        rows: null,
        columns: null,
        position: 0,
        isOpen: false,
        lastFetchFound: false,
      });
      i = j;
      continue;
    }

    // Cursor declaration without parameters: CURSOR c1 IS SELECT ...
    const cursorMatch = raw.match(/^CURSOR\s+(\w+)\s+IS\b([\s\S]*)$/i);
    if (cursorMatch) {
      const cursorName = cursorMatch[1].toUpperCase();
      const queryParts: string[] = [];
      let j = i;

      const firstTail = (cursorMatch[2] || "").trim().replace(/;$/, "");
      if (firstTail) {
        queryParts.push(firstTail);
      }

      if (!raw.endsWith(";")) {
        j = i + 1;
        while (j < lines.length) {
          const partRaw = lines[j].trim();
          if (!partRaw) {
            j++;
            continue;
          }
          queryParts.push(partRaw.replace(/;$/, "").trim());
          if (partRaw.endsWith(";")) break;
          j++;
        }
      }

      ctx.cursors.set(cursorName, {
        name: cursorName,
        query: queryParts.join(" ").trim(),
        params: [],
        rows: null,
        columns: null,
        position: 0,
        isOpen: false,
        lastFetchFound: false,
      });
      i = j;
      continue;
    }

    // Variable with %TYPE: v_name tablename.column%TYPE
    const typeRefMatch = line.match(/^(\w+)\s+(\w+)\.(\w+)%TYPE\s*(:=\s*(.*))?$/i);
    if (typeRefMatch) {
      const varName = typeRefMatch[1].toUpperCase();
      const tableName = typeRefMatch[2];
      const colName = typeRefMatch[3];
      const resolvedType = resolvePercentType(tableName, colName, ctx.db);
      const defaultVal = typeRefMatch[5] ? evaluateExpression(typeRefMatch[5], ctx) : null;
      assignVariable(ctx.variables, varName, defaultVal, resolvedType);
      continue;
    }

    // Variable with %ROWTYPE: v_rec tablename%ROWTYPE
    const rowtypeMatch = line.match(/^(\w+)\s+(\w+)%ROWTYPE\s*$/i);
    if (rowtypeMatch) {
      const varName = rowtypeMatch[1].toUpperCase();
      ctx.variables.set(varName, { name: varName, type: "ROWTYPE", value: {} });
      continue;
    }

    // Standard variable: v_name TYPE [(size)] [:= default]
    const varMatch = line.match(/^(\w+)\s+([\w()]+(?:\(\d+(?:,\s*\d+)?\))?)\s*(:=\s*(.*))?$/i);
    if (varMatch) {
      const varName = varMatch[1].toUpperCase();
      const varType = varMatch[2].toUpperCase();
      const defaultExpr = varMatch[4];
      const defaultVal = defaultExpr ? evaluateExpression(defaultExpr.trim(), ctx) : null;
      assignVariable(ctx.variables, varName, defaultVal, varType);
      continue;
    }
  }
}

// ── Statement Executor ─────────────────────────────────────────────────

/**
 * Executes a list of PL/SQL body lines within the given context.
 * Returns the index of the last processed line.
 */
function executeBody(lines: string[], ctx: ExecutionContext, lineNumbers?: number[]): void {
  let i = 0;
  const maxIterations = 100000; // safety limit
  let iterations = 0;

  while (i < lines.length) {
    if (ctx.exitLoop || ctx.hasReturned) break;
    if (++iterations > maxIterations) throw new Error("Infinite loop detected");

    const currentLineNo = lineNumbers?.[i] ?? (i + 1);
    const rawLine = lines[i].trim();
    const line = rawLine.replace(/;$/, "").trim();
    const upper = line.toUpperCase();

    if (!line || line === "/" || upper === "BEGIN" || upper === "END" || upper === "NULL") {
      i++;
      continue;
    }

    // ── BEGIN EXECUTE IMMEDIATE ... EXCEPTION WHEN OTHERS THEN NULL; END ──
    // Common Oracle pattern used for conditional DROP statements.
    const guardedImmediateMatch = line.match(
      /^BEGIN\s+EXECUTE\s+IMMEDIATE\s+([\s\S]+?)\s*;\s*EXCEPTION\s+WHEN\s+OTHERS\s+THEN\s+NULL\s*;\s*END$/i
    );
    if (guardedImmediateMatch) {
      try {
        const dynamicSql = evaluateExpression(guardedImmediateMatch[1], ctx);
        if (typeof dynamicSql === "string" && dynamicSql.trim()) {
          ctx.db.run(translateOracleSql(dynamicSql.trim()));
        }
      } catch {
        // Intentionally swallow errors to mimic WHEN OTHERS THEN NULL
      }
      i++;
      continue;
    }

    // ── EXECUTE IMMEDIATE ──
    const executeImmediateMatch = line.match(/^EXECUTE\s+IMMEDIATE\s+([\s\S]+)$/i);
    if (executeImmediateMatch) {
      const dynamicSql = evaluateExpression(executeImmediateMatch[1], ctx);
      const sqlText = String(dynamicSql ?? "").trim();
      if (sqlText) {
        try {
          ctx.db.run(translateOracleSql(sqlText));
          const rows = ctx.db.getRowsModified();
          ctx.setVar("SQL%ROWCOUNT", rows);
          ctx.setVar("SQL%FOUND", rows > 0);
          ctx.setVar("SQL%NOTFOUND", rows === 0);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new Error(`Line ${currentLineNo}: ${toOracleErrorText(msg)}`);
        }
      }
      i++;
      continue;
    }

    // ── DBMS_OUTPUT.PUT_LINE ──
    const putLineMatch = line.match(/^DBMS_OUTPUT\.PUT_LINE\s*\(([\s\S]*)\)$/i);
    if (putLineMatch) {
      const val = evaluateExpression(putLineMatch[1], ctx);
      ctx.dbmsOutput.push(String(val ?? ""));
      i++;
      continue;
    }

    // ── Variable assignment: v_name := expr ──
    const assignMatch = line.match(/^(\w+)\s*:=\s*([\s\S]+)$/i);
    if (assignMatch && ctx.hasVar(assignMatch[1])) {
      const val = evaluateExpression(assignMatch[2], ctx);
      ctx.setVar(assignMatch[1], val);
      i++;
      continue;
    }

    // ── IF / ELSIF / ELSE / END IF ──
    if (upper.startsWith("IF ") || upper === "IF") {
      i = executeIf(lines, i, ctx);
      continue;
    }

    // ── FOR loop ──
    const forMatch = upper.match(/^FOR\s+(\w+)\s+IN\s+(REVERSE\s+)?(.+?)\.\.(.+?)\s+LOOP$/i);
    if (forMatch) {
      i = executeForLoop(lines, i, forMatch, ctx);
      continue;
    }

    // ── WHILE loop ──
    const whileMatch = line.match(/^WHILE\s+([\s\S]+?)\s+LOOP$/i);
    if (whileMatch) {
      i = executeWhileLoop(lines, i, whileMatch[1], ctx);
      continue;
    }

    // ── Basic LOOP ──
    if (upper === "LOOP") {
      i = executeBasicLoop(lines, i, ctx);
      continue;
    }

    // ── EXIT WHEN ──
    const exitWhenMatch = line.match(/^EXIT\s+WHEN\s+([\s\S]+)$/i);
    if (exitWhenMatch) {
      const cond = evaluateExpression(exitWhenMatch[1], ctx);
      if (cond) ctx.exitLoop = true;
      i++;
      continue;
    }
    if (upper === "EXIT") {
      ctx.exitLoop = true;
      i++;
      continue;
    }

    // ── RETURN ──
    const returnMatch = line.match(/^RETURN\s*([\s\S]*)$/i);
    if (returnMatch) {
      if (returnMatch[1].trim()) {
        ctx.returnValue = evaluateExpression(returnMatch[1].trim(), ctx);
      }
      ctx.hasReturned = true;
      i++;
      continue;
    }

    // ── OPEN cursor (with or without parameters) ──
    const openParamMatch = line.match(/^OPEN\s+(\w+)\s*\(([^)]+)\)$/i);
    const openSimpleMatch = line.match(/^OPEN\s+(\w+)$/i);
    if (openParamMatch || openSimpleMatch) {
      const cursorName = (openParamMatch ? openParamMatch[1] : openSimpleMatch![1]).toUpperCase();
      const cursor = ctx.cursors.get(cursorName);
      if (cursor) {
        let query = cursor.query;

        // If opened with parameters, substitute cursor param names with resolved argument values
        if (openParamMatch && cursor.params.length > 0) {
          const argStrs = splitFunctionArgs(openParamMatch[2]);
          cursor.params.forEach((param, idx) => {
            if (idx < argStrs.length) {
              const argExpr = argStrs[idx].trim();
              // Resolve the argument: it could be a variable name or a literal
              let resolved: unknown = argExpr;
              // Check if it's a variable reference
              if (ctx.hasVar(argExpr)) {
                resolved = ctx.getVar(argExpr);
              } else if (/^-?\d+(\.\d+)?$/.test(argExpr)) {
                resolved = parseFloat(argExpr);
              } else if (argExpr.startsWith("'") && argExpr.endsWith("'")) {
                resolved = argExpr.slice(1, -1);
              } else {
                // Try evaluating as expression
                resolved = evaluateExpression(argExpr, ctx);
              }

              // Replace all occurrences of the cursor parameter name in the SQL
              const paramRegex = new RegExp(`\\b${param.name}\\b`, 'gi');
              if (typeof resolved === 'string') {
                query = query.replace(paramRegex, `'${resolved}'`);
              } else {
                query = query.replace(paramRegex, String(resolved ?? 'NULL'));
              }
            }
          });
        }

        // Also resolve any remaining context variables in the query
        for (const [varName, variable] of ctx.variables) {
          const re = new RegExp(`\\b${varName}\\b`, "gi");
          if (typeof variable.value === "string") {
            query = query.replace(re, `'${variable.value}'`);
          } else if (variable.value !== null && variable.value !== undefined) {
            query = query.replace(re, String(variable.value));
          }
        }
        try {
          const result = ctx.db.exec(translateOracleSql(query));
          if (result.length > 0) {
            cursor.columns = result[0].columns;
            cursor.rows = result[0].values;
          } else {
            cursor.columns = [];
            cursor.rows = [];
          }
          cursor.position = 0;
          cursor.isOpen = true;
          cursor.lastFetchFound = false;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new Error(`Line ${currentLineNo}: ${toOracleErrorText(msg)}`);
        }
      }
      i++;
      continue;
    }

    // ── FETCH cursor INTO ──
    const fetchMatch = line.match(/^FETCH\s+(\w+)\s+INTO\s+([\s\S]+)$/i);
    if (fetchMatch) {
      const cursorName = fetchMatch[1].toUpperCase();
      const varNames = fetchMatch[2].split(",").map((v) => v.trim());
      const cursor = ctx.cursors.get(cursorName);
      if (cursor && cursor.rows && cursor.position < cursor.rows.length) {
        const row = cursor.rows[cursor.position];
        for (let j = 0; j < varNames.length && j < row.length; j++) {
          const rawValue = row[j];
          const targetVar = ctx.variables.get(varNames[j].toUpperCase());
          if (targetVar) {
            // Coerce fetched value to match the declared type of the target variable
            const declaredType = targetVar.type.toUpperCase();
            const numericTypes = ['NUMBER', 'INTEGER', 'INT', 'FLOAT', 'DECIMAL', 'NUMERIC'];
            if (numericTypes.some(t => declaredType.startsWith(t))) {
              const coerced = rawValue === null || rawValue === undefined ? 0 : Number(rawValue);
              ctx.setVar(varNames[j], isNaN(coerced) ? 0 : coerced);
            } else {
              ctx.setVar(varNames[j], rawValue === null ? null : rawValue);
            }
          } else {
            ctx.setVar(varNames[j], rawValue === null ? null : rawValue);
          }
        }
        cursor.position++;
        cursor.lastFetchFound = true;
      } else if (cursor) {
        // Past end — mark as NOTFOUND (position stays beyond length)
        if (cursor.rows) cursor.position = cursor.rows.length;
        cursor.lastFetchFound = false;
      }
      i++;
      continue;
    }

    // ── CLOSE cursor ──
    const closeMatch = line.match(/^CLOSE\s+(\w+)$/i);
    if (closeMatch) {
      const cursor = ctx.cursors.get(closeMatch[1].toUpperCase());
      if (cursor) {
        cursor.isOpen = false;
        cursor.rows = null;
        cursor.position = 0;
        cursor.lastFetchFound = false;
      }
      i++;
      continue;
    }

    // ── SELECT INTO ──
    const selectIntoMatch = line.match(/^SELECT\s+([\s\S]+?)\s+INTO\s+([\s\S]+?)\s+FROM\s+([\s\S]+)$/i);
    if (selectIntoMatch) {
      const selectCols = selectIntoMatch[1];
      const intoVars = selectIntoMatch[2].split(",").map((v) => v.trim());
      const fromClause = selectIntoMatch[3];

      // Build a real SELECT query without INTO
      const query = `SELECT ${selectCols} FROM ${fromClause}`;
      try {
        const result = ctx.db.exec(translateOracleSql(query));
        if (result.length === 0 || result[0].values.length === 0) {
          throw new Error("NO_DATA_FOUND");
        }
        if (result[0].values.length > 1) {
          throw new Error("TOO_MANY_ROWS");
        }
        const row = result[0].values[0];
        for (let j = 0; j < intoVars.length && j < row.length; j++) {
          ctx.setVar(intoVars[j], row[j] === null ? null : row[j]);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === "NO_DATA_FOUND" || msg === "TOO_MANY_ROWS") throw err;
        throw new Error(`Line ${currentLineNo}: ${toOracleErrorText(msg)}`);
      }
      i++;
      continue;
    }

    // ── DML: INSERT, UPDATE, DELETE ──
    if (upper.startsWith("INSERT") || upper.startsWith("UPDATE") || upper.startsWith("DELETE")) {
      const merged = collectStatement(lines, i);
      try {
        // Resolve variables in the DML statement
        let query = merged.statement;
        for (const [varName, variable] of ctx.variables) {
          const re = new RegExp(`\\b${varName}\\b`, "gi");
          if (typeof variable.value === "string") {
            query = query.replace(re, `'${variable.value}'`);
          } else if (variable.value !== null && variable.value !== undefined) {
            query = query.replace(re, String(variable.value));
          }
        }
        ctx.db.run(translateOracleSql(query));
        const rows = ctx.db.getRowsModified();
        ctx.setVar("SQL%ROWCOUNT", rows);
        ctx.setVar("SQL%FOUND", rows > 0);
        ctx.setVar("SQL%NOTFOUND", rows === 0);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Line ${currentLineNo}: ${toOracleErrorText(msg)}`);
      }
      i = merged.nextIndex;
      continue;
    }

    // ── CREATE TABLE / DDL inside PL/SQL ──
    if (upper.startsWith("CREATE") || upper.startsWith("DROP") || upper.startsWith("ALTER")) {
      const merged = collectStatement(lines, i);
      try {
        ctx.db.run(translateOracleSql(merged.statement));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Line ${currentLineNo}: ${toOracleErrorText(msg)}`);
      }
      i = merged.nextIndex;
      continue;
    }

    // ── Procedure/function call: proc_name(args) ──
    const callMatch = line.match(/^(\w+)\s*\(([\s\S]*)\)$/);
    if (callMatch) {
      const procName = callMatch[1].toUpperCase();
      const proc = ctx.procedures.get(procName);
      if (proc) {
        const argStrs = splitFunctionArgs(callMatch[2]);
        const argVals = argStrs.map((a) => evaluateExpression(a, ctx));
        executeProcedureCall(proc, argVals, ctx);
        i++;
        continue;
      }
    }

    // ── EXEC procedure_name(args) ──
    const execMatch = line.match(/^EXEC\s+(\w+)\s*\(([\s\S]*)\)$/i);
    if (execMatch) {
      const procName = execMatch[1].toUpperCase();
      const proc = ctx.procedures.get(procName);
      if (proc) {
        const argStrs = splitFunctionArgs(execMatch[2]);
        const argVals = argStrs.map((a) => evaluateExpression(a, ctx));
        executeProcedureCall(proc, argVals, ctx);
      }
      i++;
      continue;
    }

    // ── RAISE ──
    if (upper.startsWith("RAISE")) {
      const excName = line.substring(5).trim();
      throw new Error(excName || "USER_EXCEPTION");
    }

    // Skip EXCEPTION keyword (handled at block level)
    if (upper === "EXCEPTION") {
      i++;
      continue;
    }

    i++;
  }
}

function collectStatement(lines: string[], startIdx: number): { statement: string; nextIndex: number } {
  const parts: string[] = [];
  let i = startIdx;

  while (i < lines.length) {
    const fragment = lines[i].trim();
    if (!fragment) {
      i++;
      continue;
    }
    parts.push(fragment);
    if (fragment.endsWith(";")) {
      i++;
      break;
    }
    i++;
  }

  const statement = parts.join(" ").replace(/;+\s*$/, "").trim();
  return { statement, nextIndex: i };
}

// ── IF Statement ───────────────────────────────────────────────────────

function executeIf(lines: string[], startIdx: number, ctx: ExecutionContext): number {
  let i = startIdx;
  const condMatch = lines[i].trim().match(/^IF\s+([\s\S]+?)\s+THEN$/i);
  if (!condMatch) { return i + 1; }

  const branches: Array<{ condition: string | null; bodyLines: string[] }> = [];
  let currentCondition: string | null = condMatch[1];
  let currentBody: string[] = [];
  i++;

  while (i < lines.length) {
    const upper = lines[i].trim().toUpperCase();
    if (/^END\s+IF\s*;?\s*$/i.test(lines[i].trim())) {
      branches.push({ condition: currentCondition, bodyLines: currentBody });
      i++;
      break;
    } else if (/^ELSIF\s+/i.test(lines[i].trim())) {
      branches.push({ condition: currentCondition, bodyLines: currentBody });
      const elsifMatch = lines[i].trim().match(/^ELSIF\s+([\s\S]+?)\s+THEN$/i);
      currentCondition = elsifMatch ? elsifMatch[1] : null;
      currentBody = [];
      i++;
    } else if (upper === "ELSE") {
      branches.push({ condition: currentCondition, bodyLines: currentBody });
      currentCondition = null; // ELSE branch — always true
      currentBody = [];
      i++;
    } else {
      currentBody.push(lines[i]);
      i++;
    }
  }

  // Execute the first branch whose condition is true
  for (const branch of branches) {
    if (branch.condition === null || evaluateExpression(branch.condition, ctx)) {
      executeBody(branch.bodyLines, ctx);
      break;
    }
  }

  return i;
}

// ── FOR Loop ───────────────────────────────────────────────────────────

function executeForLoop(
  lines: string[], startIdx: number,
  match: RegExpMatchArray, ctx: ExecutionContext
): number {
  const varName = match[1].toUpperCase();
  const isReverse = !!match[2];
  const low = Number(evaluateExpression(match[3], ctx));
  const high = Number(evaluateExpression(match[4], ctx));

  // Collect loop body
  let i = startIdx + 1;
  const bodyLines: string[] = [];
  let depth = 0;
  while (i < lines.length) {
    const upper = lines[i].trim().toUpperCase();
    if (/\bLOOP\s*$/.test(upper)) depth++;
    if (/^END\s+LOOP\s*;?\s*$/i.test(lines[i].trim())) {
      if (depth > 0) { depth--; bodyLines.push(lines[i]); }
      else { i++; break; }
    } else {
      bodyLines.push(lines[i]);
    }
    i++;
  }

  // Execute
  assignVariable(ctx.variables, varName, low, "NUMBER");
  if (isReverse) {
    for (let j = high; j >= low; j--) {
      ctx.setVar(varName, j);
      ctx.exitLoop = false;
      executeBody([...bodyLines], ctx);
      if (ctx.exitLoop || ctx.hasReturned) { ctx.exitLoop = false; break; }
    }
  } else {
    for (let j = low; j <= high; j++) {
      ctx.setVar(varName, j);
      ctx.exitLoop = false;
      executeBody([...bodyLines], ctx);
      if (ctx.exitLoop || ctx.hasReturned) { ctx.exitLoop = false; break; }
    }
  }

  return i;
}

// ── WHILE Loop ─────────────────────────────────────────────────────────

function executeWhileLoop(
  lines: string[], startIdx: number, condition: string, ctx: ExecutionContext
): number {
  let i = startIdx + 1;
  const bodyLines: string[] = [];
  let depth = 0;
  while (i < lines.length) {
    const upper = lines[i].trim().toUpperCase();
    if (/\bLOOP\s*$/.test(upper)) depth++;
    if (/^END\s+LOOP\s*;?\s*$/i.test(lines[i].trim())) {
      if (depth > 0) { depth--; bodyLines.push(lines[i]); }
      else { i++; break; }
    } else {
      bodyLines.push(lines[i]);
    }
    i++;
  }

  let safety = 0;
  while (evaluateExpression(condition, ctx) && safety++ < 100000) {
    ctx.exitLoop = false;
    executeBody([...bodyLines], ctx);
    if (ctx.exitLoop || ctx.hasReturned) { ctx.exitLoop = false; break; }
  }

  return i;
}

// ── Basic LOOP ─────────────────────────────────────────────────────────

function executeBasicLoop(lines: string[], startIdx: number, ctx: ExecutionContext): number {
  let i = startIdx + 1;
  const bodyLines: string[] = [];
  let depth = 0;
  while (i < lines.length) {
    const upper = lines[i].trim().toUpperCase();
    if (/\bLOOP\s*$/.test(upper)) depth++;
    if (/^END\s+LOOP\s*;?\s*$/i.test(lines[i].trim())) {
      if (depth > 0) { depth--; bodyLines.push(lines[i]); }
      else { i++; break; }
    } else {
      bodyLines.push(lines[i]);
    }
    i++;
  }

  let safety = 0;
  while (safety++ < 100000) {
    ctx.exitLoop = false;
    executeBody([...bodyLines], ctx);
    if (ctx.exitLoop || ctx.hasReturned) { ctx.exitLoop = false; break; }
  }

  return i;
}

// ── Procedure/Function Call ────────────────────────────────────────────

function executeProcedureCall(
  proc: StoredProgram, args: unknown[], ctx: ExecutionContext
): unknown {
  // Create a child context with the procedure's parameters
  const childCtx = new ExecutionContext(ctx.db, ctx.procedures);
  childCtx.dbmsOutput = ctx.dbmsOutput; // share output

  // Copy existing variables to child context
  for (const [key, variable] of ctx.variables) {
    childCtx.variables.set(key, { ...variable });
  }
  for (const [key, cursor] of ctx.cursors) {
    childCtx.cursors.set(key, { ...cursor });
  }

  // Bind parameters
  for (let j = 0; j < proc.params.length && j < args.length; j++) {
    childCtx.setVar(proc.params[j].name, args[j]);
  }

  // Parse and execute the procedure body
  const bodyLines = proc.body.split("\n").map((l) => l.trim()).filter(Boolean);
  executeBody(bodyLines, childCtx);

  return childCtx.returnValue;
}

// ── CREATE PROCEDURE / FUNCTION Parser ─────────────────────────────────

function parseCreateProgram(code: string): StoredProgram | null {
  // CREATE [OR REPLACE] PROCEDURE name (params) AS/IS ... BEGIN ... END;
  const match = code.match(
    /CREATE\s+(?:OR\s+REPLACE\s+)?(PROCEDURE|FUNCTION)\s+(\w+)\s*(?:\(([\s\S]*?)\))?\s*(?:RETURN\s+(\w+)\s+)?(?:AS|IS)\s*([\s\S]*)/i
  );
  if (!match) return null;

  const type = match[1].toUpperCase() as "PROCEDURE" | "FUNCTION";
  const name = match[2].toUpperCase();
  const paramsStr = match[3] || "";
  const returnType = match[4];
  const body = match[5];

  const params: Array<{ name: string; mode: string; type: string }> = [];
  if (paramsStr.trim()) {
    const paramParts = paramsStr.split(",");
    for (const p of paramParts) {
      const pm = p.trim().match(/^(\w+)\s+(?:(IN\s+OUT|IN|OUT)\s+)?(\w+(?:\(\d+(?:,\s*\d+)?\))?)$/i);
      if (pm) {
        params.push({ name: pm[1].toUpperCase(), mode: (pm[2] || "IN").toUpperCase(), type: pm[3].toUpperCase() });
      }
    }
  }

  return { name, type, params, body, returnType };
}

// ── Main Interpreter Entry Point ───────────────────────────────────────

/**
 * Executes a PL/SQL block against the given database.
 * @param db - The sql.js database instance
 * @param code - The raw PL/SQL code from the editor
 * @param storedPrograms - Map of stored procedures/functions (persisted per session)
 */
export function executePLSQL(
  db: Database,
  code: string,
  storedPrograms: Map<string, StoredProgram>
): PLSQLResult {
  const output: string[] = [];
  const messages: Array<{ type: "success" | "error" | "info"; text: string }> = [];
  let sqlOutput: string | null = null;
  let rawResult: { columns: string[]; rows: string[][] } | null = null;
  const startTime = performance.now();

  // Timestamp separator
  const ts = new Date().toLocaleTimeString("en-US", { hour12: false });
  messages.push({ type: "info", text: `── Run at ${ts} ──` });

  try {
    const normalizedCode = code.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const scriptLines = normalizedCode.split("\n");
    const firstBlockStart = scriptLines.findIndex((l) => /^\s*(DECLARE|BEGIN)\b/i.test(l));
    let lineOffset = 0;

    if (firstBlockStart > 0) {
      const prelude = scriptLines.slice(0, firstBlockStart).join("\n").trim();
      if (prelude) {
        const sqlResult = executeSQL(db, prelude, { lineOffset: 0 });
        messages.push(...sqlResult.messages.filter((m) => !m.text.startsWith("── Run at")));
        sqlOutput = sqlResult.output;
        rawResult = sqlResult.rawResult;
      }
      code = scriptLines.slice(firstBlockStart).join("\n");
      lineOffset = firstBlockStart;
    } else {
      code = normalizedCode;
    }

    // Oracle script terminator for PL/SQL blocks
    code = code
      .split("\n")
      .filter((l) => l.trim() !== "/")
      .join("\n");

    // Check for CREATE PROCEDURE / FUNCTION
    const createMatch = code.match(/^CREATE\s+(?:OR\s+REPLACE\s+)?(PROCEDURE|FUNCTION)\b/i);
    if (createMatch) {
      const prog = parseCreateProgram(code);
      if (prog) {
        storedPrograms.set(prog.name, prog);
        messages.push({ type: "success", text: `${prog.type === "PROCEDURE" ? "Procedure" : "Function"} ${prog.name} created.` });
        const elapsed = ((performance.now() - startTime) / 1000).toFixed(3);
        messages.push({ type: "info", text: `Executed in ${elapsed}s` });
        return { output, messages, sqlOutput, rawResult };
      }
    }

    // Check for EXEC procedure
    const execMatch = code.match(/^EXEC\s+(\w+)\s*\(([\s\S]*)\)\s*;?\s*$/i);
    if (execMatch) {
      const procName = execMatch[1].toUpperCase();
      const proc = storedPrograms.get(procName);
      if (!proc) {
        messages.push({ type: "error", text: `ORA-06550: procedure ${procName} not found` });
        return { output, messages, sqlOutput, rawResult };
      }
      const ctx = new ExecutionContext(db, storedPrograms);
      const argStrs = splitFunctionArgs(execMatch[2]);
      const argVals = argStrs.map((a) => evaluateExpression(a, ctx));
      executeProcedureCall(proc, argVals, ctx);
      output.push(...ctx.dbmsOutput);
      messages.push({ type: "success", text: "PL/SQL procedure successfully completed." });
      const elapsed = ((performance.now() - startTime) / 1000).toFixed(3);
      messages.push({ type: "info", text: `Executed in ${elapsed}s` });
      return { output, messages };
    }

    // Parse standard DECLARE...BEGIN...EXCEPTION...END block
    const lines = code.split("\n");
    const ctx = new ExecutionContext(db, storedPrograms);
    ctx.setVar("SQL%ROWCOUNT", 0);
    ctx.setVar("SQL%FOUND", false);
    ctx.setVar("SQL%NOTFOUND", true);

    // Find DECLARE, BEGIN, EXCEPTION, END sections
    let declareLines: string[] = [];
    let bodyLines: string[] = [];
    let bodyLineNumbers: number[] = [];
    let exceptionLines: string[] = [];
    let trailingLines: string[] = [];
    let trailingStartLine = 0;
    let section: "BEFORE" | "DECLARE" | "BEGIN" | "EXCEPTION" | "AFTER" = "BEFORE";
    let beginDepth = 0;

    for (let idx = 0; idx < lines.length; idx++) {
      const rawLine = lines[idx];
      const absoluteLineNo = idx + 1 + lineOffset;
      const trimmed = rawLine.trim();
      const upper = trimmed.toUpperCase().replace(/;$/, "").trim();

      if (section === "AFTER") {
        if (!trailingStartLine && trimmed) trailingStartLine = absoluteLineNo;
        trailingLines.push(rawLine);
        continue;
      }

      if (upper === "DECLARE" && section === "BEFORE") {
        section = "DECLARE";
        continue;
      }
      if (upper === "BEGIN" && (section === "BEFORE" || section === "DECLARE")) {
        section = "BEGIN";
        continue;
      }
      if (upper === "BEGIN" && section === "BEGIN") {
        beginDepth++;
        bodyLines.push(rawLine);
        bodyLineNumbers.push(absoluteLineNo);
        continue;
      }
      if (upper === "EXCEPTION" && section === "BEGIN" && beginDepth === 0) {
        section = "EXCEPTION";
        continue;
      }
      if (/^END\s*;?\s*$/i.test(trimmed) && section === "BEGIN" && beginDepth > 0) {
        beginDepth--;
        bodyLines.push(rawLine);
        bodyLineNumbers.push(absoluteLineNo);
        continue;
      }
      if (/^END\s*;?\s*$/i.test(trimmed) && section === "BEGIN" && beginDepth === 0) {
        section = "AFTER";
        continue;
      }

      switch (section) {
        case "DECLARE":
          declareLines.push(trimmed);
          break;
        case "BEGIN":
          bodyLines.push(trimmed);
          bodyLineNumbers.push(absoluteLineNo);
          break;
        case "EXCEPTION":
          exceptionLines.push(trimmed);
          break;
      }
    }

    // Parse DECLARE
    parseDeclareSection(declareLines, ctx);

    // Execute BEGIN body
    try {
      executeBody(bodyLines, ctx, bodyLineNumbers);
      output.push(...ctx.dbmsOutput);
      messages.push({ type: "success", text: "PL/SQL procedure successfully completed." });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);

      // Try to handle with EXCEPTION block
      if (exceptionLines.length > 0) {
        const handled = handleException(errMsg, exceptionLines, ctx);
        output.push(...ctx.dbmsOutput);
        if (handled) {
          messages.push({ type: "success", text: "PL/SQL procedure completed with handled exception." });
        } else {
          messages.push({ type: "error", text: toOracleErrorText(errMsg) });
        }
      } else {
        output.push(...ctx.dbmsOutput);
        messages.push({ type: "error", text: toOracleErrorText(errMsg) });
      }
    }

    const trailingSql = trailingLines
      .filter((l) => l.trim() !== "/")
      .join("\n")
      .trim();
    if (trailingSql) {
      if (shouldRunAsPLSQL(trailingSql)) {
        const nested = executePLSQL(db, trailingSql, storedPrograms);
        messages.push(
          ...nested.messages.filter(
            (m) => !m.text.startsWith("── Run at") && !m.text.startsWith("Executed in ")
          )
        );
        if (nested.output.length > 0) {
          output.push(...nested.output);
        }
        if (nested.sqlOutput) {
          sqlOutput = nested.sqlOutput;
          rawResult = nested.rawResult ?? null;
        }
      } else {
        const sqlResult = executeSQL(db, trailingSql, {
          lineOffset: trailingStartLine > 0 ? trailingStartLine - 1 : lineOffset,
        });
        messages.push(...sqlResult.messages.filter((m) => !m.text.startsWith("── Run at")));
        sqlOutput = sqlResult.output;
        rawResult = sqlResult.rawResult;
      }
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    messages.push({ type: "error", text: toOracleErrorText(errMsg) });
  }

  const elapsed = ((performance.now() - startTime) / 1000).toFixed(3);
  messages.push({ type: "info", text: `Executed in ${elapsed}s` });

  return { output, messages, sqlOutput, rawResult };
}

// ── Exception Handler ──────────────────────────────────────────────────

function handleException(errMsg: string, exceptionLines: string[], ctx: ExecutionContext): boolean {
  ctx.setVar("SQLERRM", errMsg);
  ctx.setVar("SQLCODE", -1);

  let matched = false;
  let currentHandler: string[] = [];
  let isMatchedHandler = false;

  for (const line of exceptionLines) {
    const upper = line.trim().toUpperCase().replace(/;$/, "").trim();
    const whenMatch = line.match(/^WHEN\s+([\w_]+)\s+THEN$/i);
    if (whenMatch) {
      // Process previous handler if matched
      if (isMatchedHandler && currentHandler.length > 0) {
        executeBody(currentHandler, ctx);
        return true;
      }

      const exName = whenMatch[1].toUpperCase();
      currentHandler = [];

      if (exName === "OTHERS") {
        isMatchedHandler = true;
      } else if (exName === "NO_DATA_FOUND" && errMsg === "NO_DATA_FOUND") {
        isMatchedHandler = true;
      } else if (exName === "TOO_MANY_ROWS" && errMsg === "TOO_MANY_ROWS") {
        isMatchedHandler = true;
      } else {
        isMatchedHandler = errMsg.toUpperCase().includes(exName);
      }
      matched = matched || isMatchedHandler;
    } else {
      currentHandler.push(line);
    }
  }

  // Process last handler
  if (isMatchedHandler && currentHandler.length > 0) {
    executeBody(currentHandler, ctx);
    return true;
  }

  return matched;
}

function shouldRunAsPLSQL(code: string): boolean {
  return (
    /\bDECLARE\b/i.test(code) ||
    /\bBEGIN\b/i.test(code) ||
    /\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:PROCEDURE|FUNCTION)\b/i.test(code) ||
    /^\s*EXEC\s+\w+\s*\(/im.test(code)
  );
}
