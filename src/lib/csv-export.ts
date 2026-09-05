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

/** Quotes a single CSV field per RFC 4180 (doubles embedded quotes) only when required. */
export function quoteCsvField(field: string): string {
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
