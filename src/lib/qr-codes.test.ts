import { describe, expect, it } from "vitest";
import { pickBestCode } from "./qr-codes";

type Row = { equipment_id: string | null; status: string };

describe("pickBestCode", () => {
  it("returns null for no candidates", () => {
    expect(pickBestCode([])).toBeNull();
  });

  it("returns the only candidate", () => {
    const row: Row = { equipment_id: "eq-1", status: "active" };
    expect(pickBestCode([row])).toBe(row);
  });

  it("prefers active over replaced and retired, whatever the input order", () => {
    const retired: Row = { equipment_id: "eq-3", status: "retired" };
    const replaced: Row = { equipment_id: "eq-2", status: "replaced" };
    const active: Row = { equipment_id: "eq-1", status: "active" };

    expect(pickBestCode([retired, replaced, active])).toBe(active);
    expect(pickBestCode([active, replaced, retired])).toBe(active);
  });

  it("prefers replaced over retired", () => {
    const retired: Row = { equipment_id: "eq-3", status: "retired" };
    const replaced: Row = { equipment_id: "eq-2", status: "replaced" };
    expect(pickBestCode([retired, replaced])).toBe(replaced);
  });

  it("falls back to a retired code rather than sending the technician nowhere", () => {
    const retired: Row = { equipment_id: "eq-3", status: "retired" };
    expect(pickBestCode([retired])).toBe(retired);
  });

  it("skips rows with no equipment linked", () => {
    const unlinked: Row = { equipment_id: null, status: "active" };
    const linked: Row = { equipment_id: "eq-9", status: "retired" };
    expect(pickBestCode([unlinked, linked])).toBe(linked);
    expect(pickBestCode([unlinked])).toBeNull();
  });

  it("sorts an unknown status last instead of throwing", () => {
    const weird: Row = { equipment_id: "eq-x", status: "something_new" };
    const retired: Row = { equipment_id: "eq-3", status: "retired" };
    expect(pickBestCode([weird, retired])).toBe(retired);
    // Still better than nothing when it's all we have.
    expect(pickBestCode([weird])).toBe(weird);
  });

  it("keeps the first of two equally-preferred rows", () => {
    const a: Row = { equipment_id: "eq-a", status: "active" };
    const b: Row = { equipment_id: "eq-b", status: "active" };
    expect(pickBestCode([a, b])).toBe(a);
  });
});
