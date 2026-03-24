/**
 * oracleErrors.ts
 * Maps SQLite error messages to Oracle-style error codes.
 * Used to give university students a familiar Oracle experience.
 */

const ERROR_MAP: Array<{ pattern: RegExp; oracle: string }> = [
  { pattern: /no such table/i, oracle: "ORA-00942: table or view does not exist" },
  { pattern: /syntax error/i, oracle: "ORA-00900: invalid SQL statement" },
  { pattern: /NOT NULL constraint failed/i, oracle: "ORA-01400: cannot insert NULL" },
  { pattern: /UNIQUE constraint failed/i, oracle: "ORA-00001: unique constraint violated" },
  { pattern: /PRIMARY KEY constraint failed/i, oracle: "ORA-00001: unique constraint violated" },
  { pattern: /FOREIGN KEY constraint failed/i, oracle: "ORA-02291: integrity constraint violated" },
  { pattern: /no such column/i, oracle: "ORA-00904: invalid identifier" },
  { pattern: /has no column named/i, oracle: "ORA-00904: invalid identifier" },
  { pattern: /table .+ already exists/i, oracle: "ORA-00955: name is already used by an existing object" },
  { pattern: /ambiguous column name/i, oracle: "ORA-00918: column ambiguously defined" },
  { pattern: /datatype mismatch/i, oracle: "ORA-01722: invalid number" },
  { pattern: /no such function/i, oracle: "ORA-00904: invalid identifier" },
];

/**
 * Maps a SQLite error message to an Oracle-style error string.
 */
export function mapSqliteError(sqliteMsg: string): string {
  for (const entry of ERROR_MAP) {
    if (entry.pattern.test(sqliteMsg)) {
      return entry.oracle;
    }
  }
  return `ERROR: ${sqliteMsg}`;
}
