/**
 * tableFormatter.ts
 * Renders SQL query results as ASCII box-drawing tables.
 * Matches the existing UI style with ┌─┬─┐ box characters.
 */

/**
 * Formats query results into an ASCII table string.
 * @param columns - Array of column name strings
 * @param rows - Array of row arrays (each row is string[])
 * @returns Formatted ASCII table string
 */
export function formatTable(columns: string[], rows: string[][]): string {
  if (columns.length === 0) return "";

  // Calculate column widths (min 3 chars, max content width)
  const widths = columns.map((col, i) => {
    const dataMax = rows.reduce((max, row) => {
      const val = row[i] ?? "";
      return Math.max(max, val.length);
    }, 0);
    return Math.max(col.length, dataMax, 3);
  });

  // Padding helper
  const pad = (str: string, width: number) => str + " ".repeat(Math.max(0, width - str.length));

  // Build rows
  const topBorder = "┌" + widths.map((w) => "─".repeat(w + 2)).join("┬") + "┐";
  const headerRow = "│" + columns.map((col, i) => " " + pad(col, widths[i]) + " ").join("│") + "│";
  const separator = "├" + widths.map((w) => "─".repeat(w + 2)).join("┼") + "┤";
  const dataRows = rows.map(
    (row) => "│" + row.map((val, i) => " " + pad(val ?? "NULL", widths[i]) + " ").join("│") + "│"
  );
  const bottomBorder = "└" + widths.map((w) => "─".repeat(w + 2)).join("┴") + "┘";

  return [topBorder, headerRow, separator, ...dataRows, bottomBorder].join("\n");
}

/**
 * Converts query results to CSV string for export.
 */
export function formatCsv(columns: string[], rows: string[][]): string {
  const escapeField = (field: string) => {
    if (field.includes(",") || field.includes('"') || field.includes("\n")) {
      return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
  };
  const header = columns.map(escapeField).join(",");
  const dataLines = rows.map((row) => row.map((v) => escapeField(v ?? "NULL")).join(","));
  return [header, ...dataLines].join("\n");
}
