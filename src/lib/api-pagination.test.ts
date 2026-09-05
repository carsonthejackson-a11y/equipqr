import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  byCreatedAt,
  cursorFilter,
  decodeCursor,
  encodeCursor,
  paginateRows,
  parseLimit,
} from "./api-pagination";

describe("encodeCursor / decodeCursor", () => {
  it("round-trips a cursor", () => {
    const cursor = { sortValue: "2026-09-01T12:00:00.000Z", id: "abc-123" };
    const token = encodeCursor(cursor);
    expect(decodeCursor(token)).toEqual(cursor);
  });

  it("produces a URL-safe token", () => {
    const token = encodeCursor({ sortValue: "2026-09-01T12:00:00.000Z", id: "abc/+=123" });
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("returns null for missing/empty input", () => {
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor("")).toBeNull();
  });

  it("returns null for garbage input instead of throwing", () => {
    expect(decodeCursor("not-base64-json!!")).toBeNull();
    expect(decodeCursor(Buffer.from("not json").toString("base64url"))).toBeNull();
  });

  it("returns null when the decoded shape is wrong", () => {
    const badToken = Buffer.from(JSON.stringify({ foo: "bar" })).toString("base64url");
    expect(decodeCursor(badToken)).toBeNull();
  });
});

describe("parseLimit", () => {
  it("defaults when missing", () => {
    expect(parseLimit(null)).toBe(DEFAULT_PAGE_LIMIT);
    expect(parseLimit(undefined)).toBe(DEFAULT_PAGE_LIMIT);
  });

  it("defaults on non-numeric or non-positive input", () => {
    expect(parseLimit("abc")).toBe(DEFAULT_PAGE_LIMIT);
    expect(parseLimit("0")).toBe(DEFAULT_PAGE_LIMIT);
    expect(parseLimit("-5")).toBe(DEFAULT_PAGE_LIMIT);
  });

  it("clamps to MAX_PAGE_LIMIT", () => {
    expect(parseLimit("10000")).toBe(MAX_PAGE_LIMIT);
    expect(parseLimit(String(MAX_PAGE_LIMIT + 1))).toBe(MAX_PAGE_LIMIT);
  });

  it("floors fractional values", () => {
    expect(parseLimit("10.9")).toBe(10);
  });

  it("passes through a valid value", () => {
    expect(parseLimit("25")).toBe(25);
  });
});

describe("cursorFilter", () => {
  it("builds a PostgREST or() filter defaulting to the created_at column", () => {
    const filter = cursorFilter({ sortValue: "2026-09-01T00:00:00Z", id: "id-1" });
    expect(filter).toBe(
      "created_at.lt.2026-09-01T00:00:00Z,and(created_at.eq.2026-09-01T00:00:00Z,id.lt.id-1)"
    );
  });

  it("builds the filter against a custom column", () => {
    const filter = cursorFilter({ sortValue: "2026-09-01T00:00:00Z", id: "id-1" }, "scanned_at");
    expect(filter).toBe(
      "scanned_at.lt.2026-09-01T00:00:00Z,and(scanned_at.eq.2026-09-01T00:00:00Z,id.lt.id-1)"
    );
  });
});

describe("paginateRows", () => {
  type Row = { id: string; created_at: string };
  const rows: Row[] = [
    { id: "3", created_at: "2026-09-03T00:00:00Z" },
    { id: "2", created_at: "2026-09-02T00:00:00Z" },
    { id: "1", created_at: "2026-09-01T00:00:00Z" },
  ];

  it("returns all rows with no next_cursor when under the limit", () => {
    const result = paginateRows(rows, 10, byCreatedAt);
    expect(result.rows).toHaveLength(3);
    expect(result.nextCursor).toBeNull();
  });

  it("returns exactly limit rows and no cursor when there's no extra row", () => {
    const result = paginateRows(rows, 3, byCreatedAt);
    expect(result.rows).toHaveLength(3);
    expect(result.nextCursor).toBeNull();
  });

  it("trims to limit and returns a cursor for the last row when there's an extra row", () => {
    const result = paginateRows(rows, 2, byCreatedAt);
    expect(result.rows).toHaveLength(2);
    expect(result.rows.map((r) => r.id)).toEqual(["3", "2"]);
    expect(result.nextCursor).not.toBeNull();
    expect(decodeCursor(result.nextCursor)).toEqual({ sortValue: "2026-09-02T00:00:00Z", id: "2" });
  });

  it("handles an empty array", () => {
    const result = paginateRows([], 10, byCreatedAt);
    expect(result.rows).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });

  it("supports a custom sort accessor (e.g. scanned_at)", () => {
    type ScanRow = { id: string; scanned_at: string };
    const scanRows: ScanRow[] = [
      { id: "b", scanned_at: "2026-09-02T00:00:00Z" },
      { id: "a", scanned_at: "2026-09-01T00:00:00Z" },
    ];
    const result = paginateRows(scanRows, 1, (r) => r.scanned_at);
    expect(result.rows).toEqual([{ id: "b", scanned_at: "2026-09-02T00:00:00Z" }]);
    expect(decodeCursor(result.nextCursor)).toEqual({ sortValue: "2026-09-02T00:00:00Z", id: "b" });
  });
});
