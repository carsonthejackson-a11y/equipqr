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

// Realistic values: decodeCursor() only accepts what encodeCursor() would
// have produced from a real row — a uuid `id` and a timestamptz `sortValue`.
const ID_1 = "0b8f7c2e-4d1a-4f0e-9c3b-2a1d5e6f7a8b";
const ID_2 = "5e1c0a9d-7b2f-4c3e-8d4a-9f0e1b2c3d4e";
const ID_3 = "a3f2b1c0-9e8d-4c7b-a6f5-e4d3c2b1a0f9";

describe("encodeCursor / decodeCursor", () => {
  it("round-trips a cursor", () => {
    const cursor = { sortValue: "2026-09-01T12:00:00.000Z", id: ID_1 };
    const token = encodeCursor(cursor);
    expect(decodeCursor(token)).toEqual(cursor);
  });

  it("round-trips a cursor holding a PostgREST-style timestamptz (microseconds, +00:00 offset)", () => {
    const cursor = { sortValue: "2026-09-01T12:00:00.123456+00:00", id: ID_2 };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it("produces a URL-safe token", () => {
    const token = encodeCursor({ sortValue: "2026-09-01T12:00:00.000Z", id: ID_1 });
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

  it("returns null for a tampered cursor whose fields would leak into the PostgREST filter", () => {
    // Both fields end up verbatim inside cursorFilter()'s `.or()` string, so
    // anything that isn't a uuid / timestamptz must be rejected up front
    // rather than handed to PostgREST to choke on (a 500 with its raw error).
    const badId = encodeCursor({ sortValue: "2026-09-01T12:00:00.000Z", id: "x),created_at.gt.1970-01-01" });
    expect(decodeCursor(badId)).toBeNull();

    const badSortValue = encodeCursor({ sortValue: "yesterday", id: ID_1 });
    expect(decodeCursor(badSortValue)).toBeNull();

    const injectedSortValue = encodeCursor({ sortValue: "2026-09-01T12:00:00Z,id.gt.0", id: ID_1 });
    expect(decodeCursor(injectedSortValue)).toBeNull();
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
    const filter = cursorFilter({ sortValue: "2026-09-01T00:00:00Z", id: ID_1 });
    expect(filter).toBe(
      `created_at.lt.2026-09-01T00:00:00Z,and(created_at.eq.2026-09-01T00:00:00Z,id.lt.${ID_1})`
    );
  });

  it("builds the filter against a custom column", () => {
    const filter = cursorFilter({ sortValue: "2026-09-01T00:00:00Z", id: ID_1 }, "scanned_at");
    expect(filter).toBe(
      `scanned_at.lt.2026-09-01T00:00:00Z,and(scanned_at.eq.2026-09-01T00:00:00Z,id.lt.${ID_1})`
    );
  });
});

describe("paginateRows", () => {
  type Row = { id: string; created_at: string };
  const rows: Row[] = [
    { id: ID_3, created_at: "2026-09-03T00:00:00Z" },
    { id: ID_2, created_at: "2026-09-02T00:00:00Z" },
    { id: ID_1, created_at: "2026-09-01T00:00:00Z" },
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
    expect(result.rows.map((r) => r.id)).toEqual([ID_3, ID_2]);
    expect(result.nextCursor).not.toBeNull();
    expect(decodeCursor(result.nextCursor)).toEqual({ sortValue: "2026-09-02T00:00:00Z", id: ID_2 });
  });

  it("handles an empty array", () => {
    const result = paginateRows([], 10, byCreatedAt);
    expect(result.rows).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });

  it("supports a custom sort accessor (e.g. scanned_at)", () => {
    type ScanRow = { id: string; scanned_at: string };
    const scanRows: ScanRow[] = [
      { id: ID_2, scanned_at: "2026-09-02T00:00:00Z" },
      { id: ID_1, scanned_at: "2026-09-01T00:00:00Z" },
    ];
    const result = paginateRows(scanRows, 1, (r) => r.scanned_at);
    expect(result.rows).toEqual([{ id: ID_2, scanned_at: "2026-09-02T00:00:00Z" }]);
    expect(decodeCursor(result.nextCursor)).toEqual({ sortValue: "2026-09-02T00:00:00Z", id: ID_2 });
  });
});
