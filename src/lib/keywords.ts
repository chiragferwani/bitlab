/**
 * keywords.ts
 * Hardcoded SQL/PL-SQL keyword lists with categories for autocomplete.
 */

export interface KeywordEntry {
  word: string;
  category: "keyword" | "function" | "builtin";
}

const SQL_KEYWORDS: string[] = [
  "SELECT", "FROM", "WHERE", "INSERT", "INTO", "VALUES", "UPDATE", "SET",
  "DELETE", "CREATE", "TABLE", "DROP", "ALTER", "ADD", "COLUMN", "INDEX",
  "VIEW", "JOIN", "INNER", "LEFT", "RIGHT", "OUTER", "CROSS", "ON",
  "GROUP", "ORDER", "BY", "HAVING", "DISTINCT", "AS", "AND", "OR", "NOT",
  "NULL", "IS", "IN", "LIKE", "BETWEEN", "EXISTS", "UNION", "ALL",
  "COMMIT", "ROLLBACK", "SAVEPOINT", "PRIMARY", "KEY", "FOREIGN",
  "REFERENCES", "CONSTRAINT", "DEFAULT", "CHECK", "UNIQUE", "CASCADE",
  "ASC", "DESC", "LIMIT", "OFFSET", "CASE", "WHEN", "THEN", "ELSE", "END",
  "GRANT", "REVOKE", "TRUNCATE", "WITH", "REPLACE",
];

const PLSQL_KEYWORDS: string[] = [
  "DECLARE", "BEGIN", "END", "EXCEPTION", "WHEN", "THEN", "IF", "ELSIF",
  "ELSE", "LOOP", "WHILE", "FOR", "EXIT", "RETURN", "PROCEDURE", "FUNCTION",
  "CURSOR", "IS", "AS", "OPEN", "FETCH", "CLOSE", "INTO", "TYPE",
  "ROWTYPE", "NOTFOUND", "FOUND", "ISOPEN", "ROWCOUNT",
  "DBMS_OUTPUT", "PUT_LINE", "VARCHAR2", "NUMBER", "BOOLEAN", "DATE", "CHAR",
  "IN", "OUT", "OTHERS", "SQLERRM", "SQLCODE",
  "NO_DATA_FOUND", "TOO_MANY_ROWS", "OR REPLACE", "EXEC",
  "RAISE", "PRAGMA", "AUTONOMOUS_TRANSACTION",
];

const MONGO_KEYWORDS: string[] = [
  "db", "find", "findOne", "insertOne", "insertMany",
  "updateOne", "updateMany", "deleteOne", "deleteMany",
  "aggregate", "countDocuments", "drop", "createCollection",
  "show collections", "show dbs",
  "$set", "$unset", "$inc", "$push", "$pull", "$match",
  "$group", "$sort", "$limit", "$skip", "$project",
  "$sum", "$avg", "$min", "$max", "$count",
  "$eq", "$ne", "$gt", "$gte", "$lt", "$lte",
  "$in", "$nin", "$and", "$or", "$not", "$exists",
  "ObjectId", "ISODate", "NumberInt", "NumberLong"
];

const BUILTIN_FUNCTIONS: string[] = [
  "COUNT", "SUM", "AVG", "MAX", "MIN", "UPPER", "LOWER", "LENGTH",
  "SUBSTR", "TRIM", "LTRIM", "RTRIM", "REPLACE", "INSTR",
  "TO_DATE", "TO_CHAR", "TO_NUMBER", "NVL", "NVL2", "COALESCE",
  "DECODE", "SYSDATE", "CURRENT_DATE", "CURRENT_TIMESTAMP",
  "ROWNUM", "ROWID", "ABS", "CEIL", "FLOOR", "ROUND", "TRUNC",
  "MOD", "POWER", "SQRT", "SIGN", "LPAD", "RPAD", "CONCAT",
  "GREATEST", "LEAST", "NULLIF", "CAST",
];

// Build the combined keyword list with categories
export const ALL_KEYWORDS: KeywordEntry[] = [
  ...SQL_KEYWORDS.map((w) => ({ word: w, category: "keyword" as const })),
  ...PLSQL_KEYWORDS.map((w) => ({ word: w, category: "keyword" as const })),
  ...BUILTIN_FUNCTIONS.map((w) => ({ word: w, category: "function" as const })),
  ...MONGO_KEYWORDS.map((w) => ({ word: w, category: "keyword" as const })),
];

// Deduplicate by word (keep first occurrence)
const seen = new Set<string>();
export const UNIQUE_KEYWORDS: KeywordEntry[] = ALL_KEYWORDS.filter((entry) => {
  const upper = entry.word.toUpperCase();
  if (seen.has(upper)) return false;
  seen.add(upper);
  return true;
});

/**
 * PL/SQL detection keywords — if the editor content contains any of these,
 * the mode should switch to PL/SQL.
 */
export const PLSQL_DETECT_PATTERNS = [
  /\bDECLARE\b/i,
  /\bBEGIN\b/i,
  /\bCREATE\s+(OR\s+REPLACE\s+)?PROCEDURE\b/i,
  /\bCREATE\s+(OR\s+REPLACE\s+)?FUNCTION\b/i,
  /\bCREATE\s+(OR\s+REPLACE\s+)?TRIGGER\b/i,
];

/**
 * Detects whether code is PL/SQL, MongoDB or plain SQL.
 */
export function detectMode(code: string): "SQL" | "PL/SQL" | "MONGODB" {
  if (/^db\.\w+/i.test(code.trim()) || /^show\s+(collections|dbs)/i.test(code.trim())) {
    return "MONGODB";
  }
  return PLSQL_DETECT_PATTERNS.some((p) => p.test(code)) ? "PL/SQL" : "SQL";
}
