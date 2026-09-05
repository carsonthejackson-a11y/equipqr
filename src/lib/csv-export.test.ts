import { describe, expect, it } from "vitest";
import { csvFilename, quoteCsvField, toCsv } from "./csv-export";

type Row = { name: string; qty: number; note: string | null; active: boolean };

describe("quoteCsvField", () => {
  it("leaves plain fields unquoted", () => {
    expect(quoteCsvField("hello")).toBe("hello");
    expect(quoteCsvField("")).toBe("");
  });

  it("quotes fields containing a comma", () => {
    expect(quoteCsvField("Acme, Inc.")).toBe('"Acme, Inc."');
  });

  it("quotes fields containing a quote and doubles it", () => {
    expect(quoteCsvField('12" pipe')).toBe('"12"" pipe"');
  });

  it("quotes fields containing a newline or carriage return", () => {
    expect(quoteCsvField("line1\nline2")).toBe('"line1\nline2"');
    expect(quoteCsvField("line1\r\nline2")).toBe('"line1\r\nline2"');
  });

  describe("formula injection", () => {
    // Each of these, opened in Excel/Sheets, would otherwise be evaluated.
    it.each([
      ["=", "=1+1"],
      ["+", "+1+1"],
      ["-", "-2+3"],
      ["@", "@SUM(1,1)"],
      ["tab", "\t=1+1"],
      ["carriage return", "\r=1+1"],
    ])("neutralises a leading %s with a quote prefix and force-quotes", (_label, field) => {
      expect(quoteCsvField(field)).toBe(`"'${field}"`);
    });

    it("doubles embedded quotes in a neutralised field", () => {
      expect(quoteCsvField('=cmd|"/c calc"!A1')).toBe(`"'=cmd|""/c calc""!A1"`);
    });

    it("leaves a trigger character that isn't first alone", () => {
      expect(quoteCsvField("Pump A - west wing")).toBe("Pump A - west wing");
      expect(quoteCsvField("bob@x.test")).toBe("bob@x.test");
    });

    it("leaves values we generate ourselves alone", () => {
      expect(quoteCsvField("2026-09-05T12:00:00.000Z")).toBe("2026-09-05T12:00:00.000Z");
      expect(quoteCsvField("0")).toBe("0");
    });
  });
});

describe("toCsv", () => {
  const columns = [
    { header: "Name", value: (r: Row) => r.name },
    { header: "Qty", value: (r: Row) => r.qty },
    { header: "Note", value: (r: Row) => r.note },
    { header: "Active", value: (r: Row) => r.active },
  ];

  it("starts with a UTF-8 BOM", () => {
    const csv = toCsv<Row>([], columns);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("renders the header row when there are no rows", () => {
    const csv = toCsv<Row>([], columns);
    expect(csv).toBe("﻿Name,Qty,Note,Active\r\n");
  });

  it("renders rows with CRLF line endings", () => {
    const rows: Row[] = [{ name: "Pump A", qty: 3, note: null, active: true }];
    const csv = toCsv(rows, columns);
    expect(csv).toBe("﻿Name,Qty,Note,Active\r\nPump A,3,,true\r\n");
  });

  it("quotes a field that needs it while leaving others alone", () => {
    const rows: Row[] = [{ name: "Acme, Inc.", qty: 1, note: 'has "quotes"', active: false }];
    const csv = toCsv(rows, columns);
    expect(csv).toBe('﻿Name,Qty,Note,Active\r\n"Acme, Inc.",1,"has ""quotes""",false\r\n');
  });

  it("neutralises a formula in a row value", () => {
    const rows: Row[] = [{ name: "=1+1", qty: 1, note: null, active: false }];
    const csv = toCsv(rows, columns);
    expect(csv).toBe(`﻿Name,Qty,Note,Active\r\n"'=1+1",1,,false\r\n`);
  });

  it("renders null/undefined values as an empty cell", () => {
    const rows: Row[] = [{ name: "X", qty: 0, note: null, active: false }];
    const csv = toCsv(rows, columns);
    expect(csv).toContain("X,0,,false");
  });

  it("handles multiple rows in order", () => {
    const rows: Row[] = [
      { name: "A", qty: 1, note: null, active: true },
      { name: "B", qty: 2, note: null, active: false },
    ];
    const csv = toCsv(rows, columns);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("﻿Name,Qty,Note,Active");
    expect(lines[1]).toBe("A,1,,true");
    expect(lines[2]).toBe("B,2,,false");
  });
});

describe("csvFilename", () => {
  it("formats as equipqr-<entity>-<YYYY-MM-DD>.csv in UTC", () => {
    const date = new Date("2026-09-05T23:30:00Z");
    expect(csvFilename("equipment", date)).toBe("equipqr-equipment-2026-09-05.csv");
  });

  it("uses today's date when none is passed", () => {
    const name = csvFilename("customers");
    expect(name).toMatch(/^equipqr-customers-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
