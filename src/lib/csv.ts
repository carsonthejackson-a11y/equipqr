// A small RFC-4180 CSV reader/writer. Isomorphic on purpose: the equipment
// import page parses the user's file in the browser to show a preview, and
// the server action re-parses the same text before it writes anything (never
// trust the client's parse). No dependency — the format is small enough that
// a hand-rolled parser is cheaper than the bytes a library would cost, and it
// lets us be explicit about the cases real spreadsheets produce: quoted
// fields, "" escapes inside them, embedded newlines/commas, CRLF endings and
// a UTF-8 BOM from Excel.

/** Parses CSV text into a rectangular-ish array of rows of raw (unturned) cell strings. */
export function parseCsv(text: string): string[][] {
  // Excel writes a UTF-8 BOM; it would otherwise become part of the first header.
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  // Whether the current row has started a field at all. Distinguishes a real
  // empty field ('""' or a trailing comma) from the no-op after a final newline.
  let started = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
    started = false;
  };

  while (i < src.length) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      started = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      endField();
      started = true;
      i += 1;
      continue;
    }
    if (ch === "\r" || ch === "\n") {
      // Treat CRLF as one terminator; a lone CR or LF also ends the row.
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      endRow();
      i += 1;
      continue;
    }

    field += ch;
    started = true;
    i += 1;
  }

  if (started || field.length > 0 || inQuotes) {
    endRow();
  }

  return rows;
}

export type CsvTable = {
  /** Header cells, lowercased with runs of whitespace collapsed to "_". */
  headers: string[];
  /** One record per data row, keyed by header. Missing trailing cells read as "". */
  rows: Record<string, string>[];
};

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, "_");
}

function isBlankRow(cells: string[]): boolean {
  return cells.every((cell) => cell.trim() === "");
}

/** Parses CSV text into header-keyed records, skipping entirely blank lines. */
export function parseCsvTable(text: string): CsvTable {
  const raw = parseCsv(text).filter((cells) => !isBlankRow(cells));
  if (raw.length === 0) return { headers: [], rows: [] };

  const headers = raw[0].map(normalizeHeader);
  const rows = raw.slice(1).map((cells) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = (cells[index] ?? "").trim();
    });
    return record;
  });

  return { headers, rows };
}

/**
 * Leading characters that make a spreadsheet treat a cell as a formula. Same
 * list (and same OWASP mitigation) as `quoteCsvField` in src/lib/csv-export.ts
 * — this one guards the writer half of this file, which produces the
 * downloadable import template. The PARSER above deliberately leaves cells
 * exactly as written: it feeds validation and DB writes, not a spreadsheet.
 */
const FORMULA_TRIGGERS = ["=", "+", "-", "@", "\t", "\r"];

/**
 * Quotes a single cell if it contains a comma, quote or newline, and prefixes
 * a `'` to any cell that would otherwise be read as a formula.
 */
export function csvEscape(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (FORMULA_TRIGGERS.includes(text.charAt(0))) {
    return `"'${text.replace(/"/g, '""')}"`;
  }
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Serialises rows back to CSV (CRLF line endings, as RFC 4180 specifies). */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
}

// ----------------------------------------------------------------------------
// Equipment import
// ----------------------------------------------------------------------------

/** Column order of the equipment import template. Also the accepted header set. */
export const EQUIPMENT_IMPORT_COLUMNS = [
  "name",
  "equipment_type",
  "customer",
  "make",
  "model",
  "serial_number",
  "location",
  "address",
  "contact_name",
  "contact_phone",
  "install_date",
  "warranty_ends_on",
  "status",
  "notes",
] as const;

export type EquipmentImportColumn = (typeof EQUIPMENT_IMPORT_COLUMNS)[number];

/** The downloadable starter file: header row plus one filled-in example. */
export function equipmentImportTemplateCsv(): string {
  return toCsv([
    [...EQUIPMENT_IMPORT_COLUMNS],
    [
      "Break room water heater",
      "Water heater",
      "Acme Coffee",
      "Rheem",
      "XG40T06EC36U1",
      "SN-0042",
      "Building A, Floor 2",
      "120 Main St, Springfield",
      "Dana Ruiz",
      "555-0142",
      "2024-03-18",
      "2029-03-18",
      "active",
      "Replaced anode rod at install.",
    ],
  ]);
}
