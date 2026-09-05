// RFC 4180 CSV encoding used by /api/export/[entity] and the "Data export"
// section of the API settings page. Framework-free (pure functions) so it's
// cheap to unit test without touching Supabase or Next's request/response
// types.

export type CsvColumn<T> = {
  header: string;
  /** Extracts the raw cell value for a row. Dates should already be ISO strings. */
  value: (row: T) => string | number | boolean | null | undefined;
};

function needsQuoting(field: string): boolean {
  return field.includes(",") || field.includes('"') || field.includes("\n") || field.includes("\r");
}

/**
 * Leading characters that make Excel / Sheets / LibreOffice treat a cell as a
 * formula rather than text. A customer-supplied name or note beginning with
 * one of these turns an exported CSV into code that runs on the staff
 * machine that opens it (`=HYPERLINK(...)`, `=cmd|...`, DDE) — CSV injection.
 * Tab and CR are here because a leading whitespace character is stripped by
 * some spreadsheets, exposing the `=` behind it.
 */
const FORMULA_TRIGGERS = ["=", "+", "-", "@", "\t", "\r"];

function isFormulaLike(field: string): boolean {
  return FORMULA_TRIGGERS.includes(field.charAt(0));
}

/**
 * Quotes a single CSV field per RFC 4180 (doubles embedded quotes) only when
 * required, and defuses formula injection by prefixing a single quote — the
 * OWASP mitigation, which spreadsheets read as "this cell is text". Values we
 * generate ourselves (counts, ids, ISO dates) never start with a trigger
 * character, so only untrusted text is ever altered.
 */
export function quoteCsvField(field: string): string {
  if (isFormulaLike(field)) {
    // Force-quoted as well: the leading `'` must survive re-import as part of
    // the cell, and the field may also contain a comma or quote of its own.
    return `"'${field.replace(/"/g, '""')}"`;
  }
  if (!needsQuoting(field)) return field;
  return `"${field.replace(/"/g, '""')}"`;
}

function formatCsvValue(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

/**
 * Renders rows to an RFC 4180 CSV string: CRLF line endings, a leading UTF-8
 * BOM (so Excel opens it without mangling non-ASCII text), and every field
 * quoted only when it contains a comma, quote, or newline.
 */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines: string[] = [];
  lines.push(columns.map((c) => quoteCsvField(c.header)).join(","));
  for (const row of rows) {
    lines.push(columns.map((c) => quoteCsvField(formatCsvValue(c.value(row)))).join(","));
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}

/** `equipqr-<entity>-<YYYY-MM-DD>.csv`, using UTC so the date is stable regardless of server timezone. */
export function csvFilename(entity: string, date: Date = new Date()): string {
  const iso = date.toISOString().slice(0, 10);
  return `equipqr-${entity}-${iso}.csv`;
}
