import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const COMPANY_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_COMPANY_ID = "33333333-3333-4333-8333-333333333333";

vi.mock("@/lib/auth", () => ({
  requireOwner: async () => ({
    profile: { id: "u1", company_id: COMPANY_ID, full_name: "Dana", role: "owner", created_at: "" },
    company: { id: COMPANY_ID, name: "Acme Repair", stripe_customer_id: null },
  }),
}));

vi.mock("@/lib/stripe", () => ({
  isStripeConfigured: () => false,
  getStripe: () => {
    throw new Error("not used");
  },
}));

const signOutMock = vi.fn(async () => ({ error: null }));
const deleteCompanyRpcMock = vi.fn(async () => ({ data: null, error: null }));

// RLS client: one media row so the pre-existing service-request-media path
// is still exercised alongside the new bucket walks.
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { signOut: () => signOutMock() },
    from: (table: string) => ({
      select: () => ({
        eq: async () => {
          if (table === "service_requests") return { data: [{ id: "sr-1" }], error: null };
          throw new Error(`unexpected eq() on ${table}`);
        },
        in: async () => {
          if (table === "service_request_media") {
            return { data: [{ storage_path: `${COMPANY_ID}/sr-1/photo.jpg` }], error: null };
          }
          throw new Error(`unexpected in() on ${table}`);
        },
      }),
    }),
    rpc: (fn: string) => {
      if (fn === "delete_company") return deleteCompanyRpcMock();
      throw new Error(`unexpected rpc in test: ${fn}`);
    },
  }),
}));

/**
 * A fake bucket: a flat map of full object keys. `list(prefix)` reports the
 * immediate children the way Supabase Storage does — files with an id,
 * sub-folders as entries with `id === null` — and `remove()` deletes keys.
 */
function fakeBucket(keys: string[]) {
  const objects = new Set(keys);
  const removed: string[][] = [];
  const list = vi.fn(async (prefix: string, options?: { limit?: number; offset?: number }) => {
    const children = new Map<string, boolean>(); // name -> isFolder
    for (const key of objects) {
      if (!key.startsWith(`${prefix}/`)) continue;
      const rest = key.slice(prefix.length + 1);
      const slash = rest.indexOf("/");
      if (slash === -1) children.set(rest, false);
      else children.set(rest.slice(0, slash), true);
    }
    const entries = [...children.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, isFolder]) => ({ name, id: isFolder ? null : `id-${name}` }));
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 100;
    return { data: entries.slice(offset, offset + limit), error: null };
  });
  const remove = vi.fn(async (paths: string[]) => {
    removed.push(paths);
    for (const path of paths) objects.delete(path);
    return { data: [], error: null };
  });
  return { list, remove, removed, objects };
}

let buckets: Record<string, ReturnType<typeof fakeBucket>>;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    storage: {
      from: (bucket: string) => {
        const b = buckets[bucket];
        if (!b) throw new Error(`unexpected bucket in test: ${bucket}`);
        return { list: b.list, remove: b.remove };
      },
    },
  }),
}));

describe("deleteCompany storage cleanup", () => {
  beforeEach(() => {
    signOutMock.mockClear();
    deleteCompanyRpcMock.mockClear();
    buckets = {
      "service-request-media": fakeBucket([`${COMPANY_ID}/sr-1/photo.jpg`]),
      "company-assets": fakeBucket([
        `${COMPANY_ID}/branding/logo-1.png`,
        `${COMPANY_ID}/equipment/eq-1/photo-1.jpg`,
        `${COMPANY_ID}/equipment/eq-2/photo-2.jpg`,
        // Another tenant's objects must be untouched.
        `${OTHER_COMPANY_ID}/branding/logo-9.png`,
      ]),
      "equipment-files": fakeBucket([
        `${COMPANY_ID}/equipment/eq-1/manual.pdf`,
        `${COMPANY_ID}/inspections/insp-1/signature.png`,
        `${COMPANY_ID}/inspections/insp-1/item-photo.jpg`,
        `${COMPANY_ID}/dispatch-invoices/d-1/invoice.pdf`,
        `${OTHER_COMPANY_ID}/equipment/eq-7/manual.pdf`,
      ]),
    };
  });

  it("removes every object under company-assets/<id>/ and equipment-files/<id>/ (recursing into folders), leaving other tenants alone", async () => {
    const { deleteCompany } = await import("./actions");
    const result = await deleteCompany("Acme Repair");

    expect(result).toEqual({ success: true });
    expect(deleteCompanyRpcMock).toHaveBeenCalledTimes(1);

    // Pre-existing behaviour still intact.
    expect(buckets["service-request-media"].remove).toHaveBeenCalledWith([`${COMPANY_ID}/sr-1/photo.jpg`]);

    // The PUBLIC bucket: nothing of this company's is downloadable any more.
    expect([...buckets["company-assets"].objects]).toEqual([`${OTHER_COMPANY_ID}/branding/logo-9.png`]);
    // The private bucket: documents, inspection files and invoices all gone.
    expect([...buckets["equipment-files"].objects]).toEqual([`${OTHER_COMPANY_ID}/equipment/eq-7/manual.pdf`]);

    // Only full object keys are ever passed to remove() — never a folder name.
    for (const call of buckets["company-assets"].removed.concat(buckets["equipment-files"].removed)) {
      for (const key of call) expect(key.split("/").length).toBeGreaterThanOrEqual(3);
    }

    expect(signOutMock).toHaveBeenCalledTimes(1);
  });

  it("still succeeds (best-effort) when a bucket walk fails", async () => {
    buckets["company-assets"].list.mockResolvedValueOnce({
      data: null as never,
      error: { message: "storage down" } as never,
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { deleteCompany } = await import("./actions");
    const result = await deleteCompany("Acme Repair");

    expect(result).toEqual({ success: true });
    // The other bucket was still cleaned.
    expect([...buckets["equipment-files"].objects]).toEqual([`${OTHER_COMPANY_ID}/equipment/eq-7/manual.pdf`]);
    expect(signOutMock).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  it("paginates a level with more entries than one list() page", async () => {
    const many = Array.from({ length: 1203 }, (_, i) => `${COMPANY_ID}/equipment/eq-1/doc-${String(i).padStart(4, "0")}.pdf`);
    buckets["equipment-files"] = fakeBucket(many);

    const { deleteCompany } = await import("./actions");
    await deleteCompany("Acme Repair");

    expect(buckets["equipment-files"].objects.size).toBe(0);
    // ≤1000 keys per remove() call.
    for (const call of buckets["equipment-files"].removed) expect(call.length).toBeLessThanOrEqual(1000);
  });

  it("walks to the end even when the server caps list() pages below the requested limit", async () => {
    const many = Array.from({ length: 250 }, (_, i) => `${COMPANY_ID}/equipment/eq-1/doc-${String(i).padStart(4, "0")}.pdf`);
    const bucket = fakeBucket(many);
    const realList = bucket.list.getMockImplementation()!;
    // Ignore the caller's limit: hand back at most 100 entries per page.
    bucket.list.mockImplementation((prefix, options) => realList(prefix, { ...options, limit: 100 }));
    buckets["equipment-files"] = bucket;

    const { deleteCompany } = await import("./actions");
    await deleteCompany("Acme Repair");

    expect(bucket.objects.size).toBe(0);
  });
});
