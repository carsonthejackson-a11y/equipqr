import { describe, expect, it } from "vitest";
import {
  EQUIPMENT_STATUSES,
  REQUEST_PRIORITIES,
  REQUEST_STATUSES,
  invalidEnumFilter,
  invalidTimestampFilter,
  invalidUuidFilter,
} from "./shared";

async function errorBody(response: Response | null): Promise<{ status: number; error: string } | null> {
  if (!response) return null;
  const body = (await response.json()) as { error: string };
  return { status: response.status, error: body.error };
}

describe("invalidEnumFilter", () => {
  it("returns null when the filter is absent or empty", () => {
    expect(invalidEnumFilter("status", null, REQUEST_STATUSES)).toBeNull();
    expect(invalidEnumFilter("status", "", REQUEST_STATUSES)).toBeNull();
  });

  it("returns null for every documented value", () => {
    for (const value of REQUEST_STATUSES) expect(invalidEnumFilter("status", value, REQUEST_STATUSES)).toBeNull();
    for (const value of REQUEST_PRIORITIES) expect(invalidEnumFilter("priority", value, REQUEST_PRIORITIES)).toBeNull();
    for (const value of EQUIPMENT_STATUSES) expect(invalidEnumFilter("status", value, EQUIPMENT_STATUSES)).toBeNull();
  });

  it("returns a 400 naming the filter and the allowed values for anything else", async () => {
    // Used to reach PostgREST as `.eq("status", "bogus")` on an enum column
    // and come back as a 500 with the raw Postgres message.
    expect(await errorBody(invalidEnumFilter("status", "bogus", REQUEST_STATUSES))).toEqual({
      status: 400,
      error: "status must be one of: new, in_progress, scheduled, on_hold, resolved, canceled",
    });
    expect(await errorBody(invalidEnumFilter("priority", "URGENT", REQUEST_PRIORITIES))).toEqual({
      status: 400,
      error: "priority must be one of: low, normal, high, urgent",
    });
    expect(await errorBody(invalidEnumFilter("status", "broken", EQUIPMENT_STATUSES))).toEqual({
      status: 400,
      error: "status must be one of: active, needs_service, out_of_service, retired",
    });
  });

  it("sends the same no-store header as every other v1 response", () => {
    expect(invalidEnumFilter("status", "bogus", REQUEST_STATUSES)?.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("invalidTimestampFilter", () => {
  it("returns null when the filter is absent or empty", () => {
    expect(invalidTimestampFilter("updated_since", null)).toBeNull();
    expect(invalidTimestampFilter("since", "")).toBeNull();
  });

  it("accepts ISO 8601 dates and date-times", () => {
    for (const value of [
      "2026-09-01",
      "2026-09-01T12:00",
      "2026-09-01T12:00:00",
      "2026-09-01T12:00:00Z",
      "2026-09-01T12:00:00.000Z",
      "2026-09-01T12:00:00.123456+00:00",
      "2026-09-01T07:00:00-05:00",
      "2026-09-01 12:00:00",
    ]) {
      expect(invalidTimestampFilter("updated_since", value), value).toBeNull();
    }
  });

  it("returns a 400 for anything that isn't an ISO timestamp", async () => {
    for (const value of ["yesterday", "Sept 1 2026", "1725148800", "2026-13-45", "2026-09-01T25:00:00Z", "now()"]) {
      const result = await errorBody(invalidTimestampFilter("updated_since", value));
      expect(result?.status, value).toBe(400);
      expect(result?.error, value).toBe("updated_since must be an ISO 8601 timestamp, e.g. 2026-09-01T00:00:00Z");
    }
  });
});

describe("invalidUuidFilter", () => {
  it("returns null when the filter is absent, empty, or a UUID (either case)", () => {
    expect(invalidUuidFilter("equipment_id", null)).toBeNull();
    expect(invalidUuidFilter("equipment_id", "")).toBeNull();
    expect(invalidUuidFilter("equipment_id", "6f0e3d7a-3c2b-4f4e-9a1d-2d0e2b6e2a11")).toBeNull();
    expect(invalidUuidFilter("customer_id", "6F0E3D7A-3C2B-4F4E-9A1D-2D0E2B6E2A11")).toBeNull();
  });

  it("returns a 400 for anything Postgres would reject with 22P02", async () => {
    // `.eq("equipment_id", "bogus")` on a uuid column used to surface as a
    // 500 carrying the raw Postgres message; docs/API.md promises a 400.
    for (const value of ["bogus", "123", "6f0e3d7a-3c2b-4f4e-9a1d", "6f0e3d7a3c2b4f4e9a1d2d0e2b6e2a11)"]) {
      expect(await errorBody(invalidUuidFilter("equipment_id", value))).toEqual({
        status: 400,
        error: "equipment_id must be a UUID",
      });
    }
  });
});
