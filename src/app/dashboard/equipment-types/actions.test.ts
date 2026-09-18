import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GuideGraphNode } from "@/lib/types";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const requireOwnerMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireOwner: () => requireOwnerMock(),
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/billing", () => ({
  getEntitlements: vi.fn(),
  hasFeature: vi.fn(),
  requireActiveSubscription: vi.fn(async () => null),
}));
vi.mock("@/lib/rate-limit", () => ({ RATE_LIMITS: {}, checkRateLimit: vi.fn() }));

const createClientMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: () => createClientMock() }));

type Call = {
  table: string;
  op: "select" | "insert" | "update" | "delete" | "";
  payload?: unknown;
  /** [column, value] in call order; non-eq filters are prefixed, e.g. "in:guide_step_id". */
  filters: [string, unknown][];
};
type Reply = { data?: unknown; error?: { message: string } | null; count?: number | null };

/**
 * Purpose-built fake for the exact query chains actions.ts uses — every
 * builder method records onto the call and returns the builder, and awaiting
 * the builder resolves whatever `reply(call)` says for that call. The first
 * select/insert/update/delete names the operation; a trailing `.select("id")`
 * after a delete/insert is just chained through. Not a general Supabase mock.
 */
function fakeSupabase(reply: (call: Call) => Reply | undefined = () => ({})) {
  const calls: Call[] = [];
  function from(table: string) {
    const call: Call = { table, op: "", filters: [] };
    calls.push(call);
    const builder: Record<string, unknown> = {};
    const op = (name: Exclude<Call["op"], "">) => (payload?: unknown) => {
      if (!call.op) {
        call.op = name;
        call.payload = payload;
      }
      return builder;
    };
    const filter = (name: string) => (column: string, value: unknown) => {
      call.filters.push([name === "eq" ? column : `${name}:${column}`, value]);
      return builder;
    };
    Object.assign(builder, {
      select: op("select"),
      insert: op("insert"),
      update: op("update"),
      delete: op("delete"),
      eq: filter("eq"),
      neq: filter("neq"),
      in: filter("in"),
      order: () => builder,
      returns: () => builder,
      maybeSingle: () => builder,
      single: () => builder,
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve({ data: null, error: null, count: null, ...reply(call) }).then(resolve, reject),
    });
    return builder;
  }
  return { client: { from }, calls };
}

function ops(calls: Call[]): string[] {
  return calls.map((c) => `${c.op} ${c.table}`);
}

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

const validGraph: GuideGraphNode[] = [
  {
    tempId: "n1",
    title: "Symptom?",
    instructions: null,
    isRoot: true,
    options: [{ label: "Not heating", outcome: "continue", nextTempId: "n2" }],
  },
  {
    tempId: "n2",
    title: "Check the display",
    instructions: "Is it lit?",
    isRoot: false,
    options: [{ label: "Still broken", outcome: "escalate", nextTempId: null }],
  },
];

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  requireOwnerMock.mockResolvedValue({ profile: { role: "owner" }, company: { id: "company-1" } });
});

describe("replaceGuideGraph", () => {
  it("refuses a non-owner before touching the database (replacing deletes every step)", async () => {
    requireOwnerMock.mockResolvedValue(null);
    const fake = fakeSupabase();
    createClientMock.mockResolvedValue(fake.client);
    const { replaceGuideGraph } = await import("./actions");

    const result = await replaceGuideGraph("type-1", validGraph);

    expect(result).toEqual({ error: "Only owners can replace a troubleshooting guide." });
    expect(fake.calls).toEqual([]);
  });

  it("rejects an invalid graph before touching the database (P3)", async () => {
    const fake = fakeSupabase();
    createClientMock.mockResolvedValue(fake.client);
    const { replaceGuideGraph } = await import("./actions");

    const result = await replaceGuideGraph("type-1", [validGraph[0], { ...validGraph[1], isRoot: true }]);

    expect(result).toEqual({ error: "Only one step can be the start" });
    expect(fake.calls).toEqual([]);
  });

  it("deletes the old guide's options before its steps, then inserts the new graph with resolved ids (P1/P3)", async () => {
    let inserted = 0;
    const fake = fakeSupabase((call) => {
      if (call.table === "guide_steps" && call.op === "select") return { data: [{ id: "old-1" }, { id: "old-2" }] };
      if (call.table === "guide_steps" && call.op === "insert") return { data: { id: `new-${++inserted}` } };
      return {};
    });
    createClientMock.mockResolvedValue(fake.client);
    const { replaceGuideGraph } = await import("./actions");

    const result = await replaceGuideGraph("type-1", validGraph);

    expect(result).toEqual({ success: true });
    expect(ops(fake.calls)).toEqual([
      "select guide_steps",
      "delete guide_options",
      "delete guide_steps",
      "insert guide_steps",
      "insert guide_steps",
      "insert guide_options",
    ]);
    expect(fake.calls[1].filters).toEqual([["in:guide_step_id", ["old-1", "old-2"]]]);
    expect(fake.calls[5].payload).toEqual([
      { guide_step_id: "new-1", label: "Not heating", outcome: "continue", next_step_id: "new-2" },
      { guide_step_id: "new-2", label: "Still broken", outcome: "escalate", next_step_id: null },
    ]);
  });

  it("skips the options delete when the type has no steps yet", async () => {
    const fake = fakeSupabase((call) => {
      if (call.table === "guide_steps" && call.op === "select") return { data: [] };
      if (call.table === "guide_steps" && call.op === "insert") return { data: { id: "new-1" } };
      return {};
    });
    createClientMock.mockResolvedValue(fake.client);
    const { replaceGuideGraph } = await import("./actions");

    await replaceGuideGraph("type-1", [{ ...validGraph[0], options: [] }]);

    expect(ops(fake.calls)).toEqual(["select guide_steps", "delete guide_steps", "insert guide_steps"]);
  });
});

describe("deleteGuideStep", () => {
  it("repoints options that continue to the step to 'escalate' before deleting it (P1)", async () => {
    const fake = fakeSupabase((call) => {
      if (call.table === "guide_steps" && call.op === "select") return { data: { is_root: false } };
      return {};
    });
    createClientMock.mockResolvedValue(fake.client);
    const { deleteGuideStep } = await import("./actions");

    const result = await deleteGuideStep("step-2", "type-1");

    expect(result).toEqual({ success: true });
    expect(ops(fake.calls)).toEqual(["select guide_steps", "update guide_options", "delete guide_steps"]);
    expect(fake.calls[1]).toMatchObject({
      payload: { outcome: "escalate", next_step_id: null },
      filters: [["next_step_id", "step-2"]],
    });
    expect(fake.calls[2].filters).toEqual([["id", "step-2"]]);
  });

  it("surfaces a failed repoint instead of going on to the delete", async () => {
    const fake = fakeSupabase((call) => {
      if (call.table === "guide_steps" && call.op === "select") return { data: { is_root: false } };
      if (call.table === "guide_options") return { error: { message: "permission denied" } };
      return {};
    });
    createClientMock.mockResolvedValue(fake.client);
    const { deleteGuideStep } = await import("./actions");

    const result = await deleteGuideStep("step-2", "type-1");

    expect(result).toEqual({ error: "permission denied" });
    expect(ops(fake.calls)).toEqual(["select guide_steps", "update guide_options"]);
  });
});

describe("deleteEquipmentType", () => {
  it("refuses a non-owner before touching the database", async () => {
    requireOwnerMock.mockResolvedValue(null);
    const fake = fakeSupabase();
    createClientMock.mockResolvedValue(fake.client);
    const { deleteEquipmentType } = await import("./actions");

    const result = await deleteEquipmentType("type-1");

    expect(result).toEqual({ error: "Only owners can delete equipment types." });
    expect(fake.calls).toEqual([]);
  });

  it("refuses while equipment still uses the type, without deleting any guide options", async () => {
    const fake = fakeSupabase((call) => (call.table === "equipment" ? { count: 2 } : {}));
    createClientMock.mockResolvedValue(fake.client);
    const { deleteEquipmentType } = await import("./actions");

    const result = await deleteEquipmentType("type-1");

    expect(result).toEqual({
      error: "This type is still assigned to equipment. Reassign or delete that equipment first.",
    });
    expect(ops(fake.calls)).toEqual(["select equipment"]);
  });

  it("deletes the type's guide options, then the type (P1)", async () => {
    const fake = fakeSupabase((call) => {
      if (call.table === "equipment") return { count: 0 };
      if (call.table === "guide_steps") return { data: [{ id: "s1" }, { id: "s2" }] };
      if (call.table === "equipment_types") return { data: [{ id: "type-1" }] };
      return {};
    });
    createClientMock.mockResolvedValue(fake.client);
    const { deleteEquipmentType } = await import("./actions");

    const result = await deleteEquipmentType("type-1");

    expect(result).toEqual({ success: true });
    expect(ops(fake.calls)).toEqual(["select equipment", "select guide_steps", "delete guide_options", "delete equipment_types"]);
    expect(fake.calls[2].filters).toEqual([["in:guide_step_id", ["s1", "s2"]]]);
  });

  it("still turns a 0-row delete (RLS filtered it) into an explicit error", async () => {
    const fake = fakeSupabase((call) => {
      if (call.table === "equipment") return { count: 0 };
      if (call.table === "guide_steps") return { data: [] };
      if (call.table === "equipment_types") return { data: [] };
      return {};
    });
    createClientMock.mockResolvedValue(fake.client);
    const { deleteEquipmentType } = await import("./actions");

    const result = await deleteEquipmentType("type-1");

    expect(result).toEqual({ error: "Only owners can delete equipment types." });
  });
});

describe("createGuideOption (P4)", () => {
  it("won't let an option continue to its own step", async () => {
    const fake = fakeSupabase();
    createClientMock.mockResolvedValue(fake.client);
    const { createGuideOption } = await import("./actions");

    const result = await createGuideOption(
      "step-1",
      "type-1",
      formData({ label: "Loop", outcome: "continue", nextStepId: "step-1" })
    );

    expect(result).toEqual({ error: "An option can't continue to its own step" });
    expect(fake.calls).toEqual([]);
  });

  it("rejects a target step that isn't in this guide (other type or other company)", async () => {
    // Only the source step is visible under this type — the target isn't.
    const fake = fakeSupabase((call) => (call.table === "guide_steps" ? { data: [{ id: "step-1" }] } : {}));
    createClientMock.mockResolvedValue(fake.client);
    const { createGuideOption } = await import("./actions");

    const result = await createGuideOption(
      "step-1",
      "type-1",
      formData({ label: "Go", outcome: "continue", nextStepId: "someone-elses-step" })
    );

    expect(result).toEqual({ error: "Choose a step from this guide" });
    expect(ops(fake.calls)).toEqual(["select guide_steps"]);
    expect(fake.calls[0].filters).toEqual([
      ["equipment_type_id", "type-1"],
      ["in:id", ["step-1", "someone-elses-step"]],
    ]);
  });

  it("inserts when both steps belong to the type", async () => {
    const fake = fakeSupabase((call) => {
      if (call.table === "guide_steps") return { data: [{ id: "step-1" }, { id: "step-2" }] };
      if (call.table === "guide_options" && call.op === "select") return { count: 3 };
      return {};
    });
    createClientMock.mockResolvedValue(fake.client);
    const { createGuideOption } = await import("./actions");

    const result = await createGuideOption(
      "step-1",
      "type-1",
      formData({ label: "Go", outcome: "continue", nextStepId: "step-2" })
    );

    expect(result).toEqual({ success: true });
    expect(ops(fake.calls)).toEqual(["select guide_steps", "select guide_options", "insert guide_options"]);
    expect(fake.calls[2].payload).toEqual({
      guide_step_id: "step-1",
      label: "Go",
      outcome: "continue",
      next_step_id: "step-2",
      sort_order: 3,
    });
  });

  it("doesn't look up a target for a terminal outcome", async () => {
    const fake = fakeSupabase((call) => (call.op === "select" ? { count: 0 } : {}));
    createClientMock.mockResolvedValue(fake.client);
    const { createGuideOption } = await import("./actions");

    await createGuideOption("step-1", "type-1", formData({ label: "Fixed", outcome: "resolved" }));

    expect(ops(fake.calls)).toEqual(["select guide_options", "insert guide_options"]);
  });
});

describe("updateGuideOption (P4)", () => {
  it("loads the option's own step and refuses a self-target", async () => {
    const fake = fakeSupabase((call) =>
      call.table === "guide_options" && call.op === "select" ? { data: { guide_step_id: "step-1" } } : {}
    );
    createClientMock.mockResolvedValue(fake.client);
    const { updateGuideOption } = await import("./actions");

    const result = await updateGuideOption(
      "opt-1",
      "type-1",
      formData({ label: "Loop", outcome: "continue", nextStepId: "step-1" })
    );

    expect(result).toEqual({ error: "An option can't continue to its own step" });
    expect(ops(fake.calls)).toEqual(["select guide_options"]);
  });

  it("rejects a target outside this guide, and updates a valid one", async () => {
    const fake = fakeSupabase((call) => {
      if (call.table === "guide_options" && call.op === "select") return { data: { guide_step_id: "step-1" } };
      if (call.table === "guide_steps") return { data: [{ id: "step-1" }] };
      return {};
    });
    createClientMock.mockResolvedValue(fake.client);
    const { updateGuideOption } = await import("./actions");

    const rejected = await updateGuideOption(
      "opt-1",
      "type-1",
      formData({ label: "Go", outcome: "continue", nextStepId: "step-9" })
    );
    expect(rejected).toEqual({ error: "Choose a step from this guide" });
    expect(ops(fake.calls)).toEqual(["select guide_options", "select guide_steps"]);

    fake.calls.length = 0;
    const ok = fakeSupabase((call) => {
      if (call.table === "guide_options" && call.op === "select") return { data: { guide_step_id: "step-1" } };
      if (call.table === "guide_steps") return { data: [{ id: "step-1" }, { id: "step-2" }] };
      return {};
    });
    createClientMock.mockResolvedValue(ok.client);
    const accepted = await updateGuideOption(
      "opt-1",
      "type-1",
      formData({ label: "Go", outcome: "continue", nextStepId: "step-2" })
    );
    expect(accepted).toEqual({ success: true });
    expect(ops(ok.calls)).toEqual(["select guide_options", "select guide_steps", "update guide_options"]);
    expect(ok.calls[2]).toMatchObject({
      payload: { label: "Go", outcome: "continue", next_step_id: "step-2" },
      filters: [["id", "opt-1"]],
    });
  });

  it("reports a missing option instead of updating blind", async () => {
    const fake = fakeSupabase(() => ({ data: null }));
    createClientMock.mockResolvedValue(fake.client);
    const { updateGuideOption } = await import("./actions");

    const result = await updateGuideOption(
      "opt-gone",
      "type-1",
      formData({ label: "Go", outcome: "continue", nextStepId: "step-2" })
    );

    expect(result).toEqual({ error: "Option not found" });
    expect(ops(fake.calls)).toEqual(["select guide_options"]);
  });
});
