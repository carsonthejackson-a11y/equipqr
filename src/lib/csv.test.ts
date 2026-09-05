import { describe, expect, it } from "vitest";
import {
  EQUIPMENT_IMPORT_COLUMNS,
  csvEscape,
  equipmentImportTemplateCsv,
  parseCsv,
  parseCsvTable,
  toCsv,
} from "@/lib/csv";

describe("parseCsv", () => {
  it("parses plain rows", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles CRLF line endings", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("does not emit a phantom row for a trailing newline", () => {
    expect(parseCsv("a\n")).toEqual([["a"]]);
    expect(parseCsv("a\r\n")).toEqual([["a"]]);
  });

  it("keeps empty fields, including trailing ones", () => {
    expect(parseCsv("a,,c\n,,")).toEqual([
      ["a", "", "c"],
      ["", "", ""],
    ]);
  });

  it("unwraps quoted fields", () => {
    expect(parseCsv('"a","b"')).toEqual([["a", "b"]]);
    expect(parseCsv('""')).toEqual([[""]]);
  });

  it("keeps commas and newlines inside quotes", () => {
    expect(parseCsv('"Main St, Apt 2",x\n')).toEqual([["Main St, Apt 2", "x"]]);
    expect(parseCsv('"line one\nline two",x')).toEqual([["line one\nline two", "x"]]);
    expect(parseCsv('"line one\r\nline two",x')).toEqual([["line one\r\nline two", "x"]]);
  });

  it('unescapes doubled quotes', () => {
    expect(parseCsv('"say ""hi""",x')).toEqual([['say "hi"', "x"]]);
    expect(parseCsv('"""quoted"""')).toEqual([['"quoted"']]);
  });

  it("strips a UTF-8 BOM from the first header", () => {
    expect(parseCsv("﻿name,make\nA,B")).toEqual([
      ["name", "make"],
      ["A", "B"],
    ]);
  });

  it("returns nothing for empty input", () => {
    expect(parseCsv("")).toEqual([]);
  });

  it("tolerates an unterminated quote by taking the rest of the file", () => {
    expect(parseCsv('a,"unterminated')).toEqual([["a", "unterminated"]]);
  });
});

describe("parseCsvTable", () => {
  it("keys rows by normalized header", () => {
    const table = parseCsvTable("Name, Equipment Type\nBoiler 1, Water heater\n");
    expect(table.headers).toEqual(["name", "equipment_type"]);
    expect(table.rows).toEqual([{ name: "Boiler 1", equipment_type: "Water heater" }]);
  });

  it("skips blank lines and fills missing trailing cells", () => {
    const table = parseCsvTable("name,make\n\nBoiler,\n,,\nPump,Grundfos\n");
    expect(table.rows).toEqual([
      { name: "Boiler", make: "" },
      { name: "Pump", make: "Grundfos" },
    ]);
  });

  it("returns an empty table for empty input", () => {
    expect(parseCsvTable("   \n")).toEqual({ headers: [], rows: [] });
  });
});

describe("csvEscape / toCsv", () => {
  it("only quotes when it has to", () => {
    expect(csvEscape("plain")).toBe("plain");
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape("two\nlines")).toBe('"two\nlines"');
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(42)).toBe("42");
  });

  it("round-trips through the parser", () => {
    const rows = [
      ["name", "notes"],
      ["Boiler, big", 'said "ok"'],
      ["Pump", "line one\nline two"],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});

describe("equipmentImportTemplateCsv", () => {
  it("starts with the documented column order and one example row", () => {
    const table = parseCsvTable(equipmentImportTemplateCsv());
    expect(table.headers).toEqual([...EQUIPMENT_IMPORT_COLUMNS]);
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0].name).toBe("Break room water heater");
    expect(table.rows[0].status).toBe("active");
  });
});
