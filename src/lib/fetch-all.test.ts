import { describe, expect, it, vi } from "vitest";
import { POSTGREST_MAX_ROWS, fetchAll } from "./fetch-all";

type Row = { id: number };

function rowsFrom(from: number, count: number): Row[] {
  return Array.from({ length: count }, (_, i) => ({ id: from + i }));
}

describe("fetchAll", () => {
  it("keeps paging past PostgREST's max-rows until a short page comes back", async () => {
    // A 1003-row table: an un-ranged select would silently return the first
    // 1000 with a 200. Paged, it takes exactly two requests.
    const page = vi.fn(async (from: number, to: number) => ({
      data: rowsFrom(from, Math.min(to - from + 1, 1003 - from)),
      error: null,
    }));

    const rows = await fetchAll(page);

    expect(rows).toHaveLength(1003);
    expect(rows[0]).toEqual({ id: 0 });
    expect(rows[1002]).toEqual({ id: 1002 });
    expect(page).toHaveBeenCalledTimes(2);
    expect(page).toHaveBeenNthCalledWith(1, 0, POSTGREST_MAX_ROWS - 1);
    expect(page).toHaveBeenNthCalledWith(2, POSTGREST_MAX_ROWS, 2 * POSTGREST_MAX_ROWS - 1);
  });

  it("stops after one request when the first page is already short", async () => {
    const page = vi.fn(async () => ({ data: rowsFrom(0, 3), error: null }));
    expect(await fetchAll(page)).toHaveLength(3);
    expect(page).toHaveBeenCalledTimes(1);
  });

  it("makes one extra (empty) request when the row count is an exact multiple of the page size", async () => {
    const page = vi.fn(async (from: number) => ({ data: from === 0 ? rowsFrom(0, 2) : [], error: null }));
    expect(await fetchAll(page, 2)).toHaveLength(2);
    expect(page).toHaveBeenCalledTimes(2);
  });

  it("treats a null data page as empty", async () => {
    const page = vi.fn(async () => ({ data: null, error: null }));
    expect(await fetchAll<Row>(page)).toEqual([]);
  });

  it("throws on a query error instead of returning a partial result", async () => {
    const page = vi.fn(async () => ({ data: null, error: { message: "permission denied" } }));
    await expect(fetchAll<Row>(page)).rejects.toThrow("permission denied");
  });
});
