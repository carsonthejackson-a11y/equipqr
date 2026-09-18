import { describe, expect, it, vi, beforeEach } from "vitest";
import type { DraftGuideNode } from "./anthropic";

describe("normalizeDraftNodes", () => {
  it("keeps a well-formed graph unchanged", async () => {
    const { normalizeDraftNodes } = await import("./anthropic");
    const nodes: DraftGuideNode[] = [
      {
        temp_id: "n1",
        title: "Symptom?",
        instructions: "",
        is_root: true,
        options: [{ label: "Not heating", outcome: "continue", next_temp_id: "n2" }],
      },
      {
        temp_id: "n2",
        title: "Check breaker",
        instructions: "Look at the panel",
        is_root: false,
        options: [
          { label: "Fixed it", outcome: "resolved", next_temp_id: null },
          { label: "Still broken", outcome: "escalate", next_temp_id: null },
        ],
      },
    ];

    const result = normalizeDraftNodes(nodes);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ tempId: "n1", isRoot: true });
    expect(result[0].options[0]).toEqual({
      label: "Not heating",
      outcome: "continue",
      nextTempId: "n2",
    });
    expect(result[1].options.map((o) => o.outcome)).toEqual(["resolved", "escalate"]);
  });

  it("downgrades a 'continue' option whose next_temp_id isn't in this draft to 'escalate'", async () => {
    const { normalizeDraftNodes } = await import("./anthropic");
    const nodes: DraftGuideNode[] = [
      {
        temp_id: "n1",
        title: "Root",
        instructions: "",
        is_root: true,
        options: [{ label: "Continue", outcome: "continue", next_temp_id: "does-not-exist" }],
      },
    ];

    const result = normalizeDraftNodes(nodes);

    expect(result[0].options[0]).toEqual({
      label: "Continue",
      outcome: "escalate",
      nextTempId: null,
    });
  });

  it("downgrades a 'continue' option with a null next_temp_id (dead end) to 'escalate'", async () => {
    const { normalizeDraftNodes } = await import("./anthropic");
    const nodes: DraftGuideNode[] = [
      {
        temp_id: "n1",
        title: "Root",
        instructions: "",
        is_root: true,
        options: [{ label: "Continue nowhere", outcome: "continue", next_temp_id: null }],
      },
    ];

    const result = normalizeDraftNodes(nodes);

    expect(result[0].options[0].outcome).toBe("escalate");
    expect(result[0].options[0].nextTempId).toBeNull();
  });

  it("leaves 'resolved' and 'escalate' options' next_temp_id null even if the model set one", async () => {
    const { normalizeDraftNodes } = await import("./anthropic");
    const nodes: DraftGuideNode[] = [
      {
        temp_id: "n1",
        title: "Root",
        instructions: "",
        is_root: true,
        options: [{ label: "Done", outcome: "resolved", next_temp_id: "n1" }],
      },
    ];

    const result = normalizeDraftNodes(nodes);
    expect(result[0].options[0]).toEqual({ label: "Done", outcome: "resolved", nextTempId: null });
  });

  it("falls back to the first node as root when no node is marked is_root", async () => {
    const { normalizeDraftNodes } = await import("./anthropic");
    const nodes: DraftGuideNode[] = [
      { temp_id: "n1", title: "First", instructions: "", is_root: false, options: [] },
      { temp_id: "n2", title: "Second", instructions: "", is_root: false, options: [] },
    ];

    const result = normalizeDraftNodes(nodes);
    expect(result[0].isRoot).toBe(true);
    expect(result[1].isRoot).toBe(false);
  });

  it("respects the model's is_root flags when exactly one node is marked root", async () => {
    const { normalizeDraftNodes } = await import("./anthropic");
    const nodes: DraftGuideNode[] = [
      { temp_id: "n1", title: "First", instructions: "", is_root: false, options: [] },
      { temp_id: "n2", title: "Second", instructions: "", is_root: true, options: [] },
    ];

    const result = normalizeDraftNodes(nodes);
    expect(result[0].isRoot).toBe(false);
    expect(result[1].isRoot).toBe(true);
  });

  it("normalizes blank/whitespace-only instructions to null", async () => {
    const { normalizeDraftNodes } = await import("./anthropic");
    const nodes: DraftGuideNode[] = [
      { temp_id: "n1", title: "Root", instructions: "   ", is_root: true, options: [] },
    ];

    const result = normalizeDraftNodes(nodes);
    expect(result[0].instructions).toBeNull();
  });

  it("keeps only the first root when the model marks several (guide_steps_one_root_per_type)", async () => {
    const { normalizeDraftNodes } = await import("./anthropic");
    const nodes: DraftGuideNode[] = [
      { temp_id: "n1", title: "First", instructions: "", is_root: false, options: [] },
      { temp_id: "n2", title: "Second", instructions: "", is_root: true, options: [] },
      { temp_id: "n3", title: "Third", instructions: "", is_root: true, options: [] },
    ];

    const result = normalizeDraftNodes(nodes);
    expect(result.map((n) => n.isRoot)).toEqual([false, true, false]);
  });

  it("tolerates a node with no options array (and a non-array one)", async () => {
    const { normalizeDraftNodes } = await import("./anthropic");
    const nodes: DraftGuideNode[] = [
      { temp_id: "n1", title: "Root", is_root: true },
      { temp_id: "n2", title: "Broken", options: "nope" as unknown as DraftGuideNode["options"] },
    ];

    const result = normalizeDraftNodes(nodes);
    expect(result).toHaveLength(2);
    expect(result[0].options).toEqual([]);
    expect(result[1].options).toEqual([]);
    expect(result[0].instructions).toBeNull();
  });

  it("coerces an outcome outside the enum to 'escalate'", async () => {
    const { normalizeDraftNodes } = await import("./anthropic");
    const nodes: DraftGuideNode[] = [
      {
        temp_id: "n1",
        title: "Root",
        is_root: true,
        options: [
          { label: "Made up", outcome: "retry", next_temp_id: null },
          { label: "Still fine", outcome: "resolved", next_temp_id: null },
        ],
      },
    ];

    const result = normalizeDraftNodes(nodes);
    expect(result[0].options).toEqual([
      { label: "Made up", outcome: "escalate", nextTempId: null },
      { label: "Still fine", outcome: "resolved", nextTempId: null },
    ]);
  });

  it("drops a duplicate temp_id (first occurrence wins) and re-targets continues accordingly", async () => {
    const { normalizeDraftNodes } = await import("./anthropic");
    const nodes: DraftGuideNode[] = [
      {
        temp_id: "n1",
        title: "Root",
        is_root: true,
        options: [{ label: "Go", outcome: "continue", next_temp_id: "n2" }],
      },
      { temp_id: "n2", title: "Real n2", options: [] },
      { temp_id: "n2", title: "Impostor n2", options: [] },
    ];

    const result = normalizeDraftNodes(nodes);
    expect(result.map((n) => n.title)).toEqual(["Root", "Real n2"]);
    expect(result[0].options[0]).toEqual({ label: "Go", outcome: "continue", nextTempId: "n2" });
  });

  it("drops options with an empty label and trims the rest", async () => {
    const { normalizeDraftNodes } = await import("./anthropic");
    const nodes: DraftGuideNode[] = [
      {
        temp_id: "n1",
        title: "Root",
        is_root: true,
        options: [
          { label: "   ", outcome: "resolved", next_temp_id: null },
          { label: "  Fixed  ", outcome: "resolved", next_temp_id: null },
        ],
      },
    ];

    const result = normalizeDraftNodes(nodes);
    expect(result[0].options).toEqual([{ label: "Fixed", outcome: "resolved", nextTempId: null }]);
  });

  it("caps a draft at 40 nodes and 8 options per node, escalating continues to nodes that got cut", async () => {
    const { normalizeDraftNodes, MAX_GUIDE_STEPS, MAX_GUIDE_OPTIONS_PER_STEP } = await import("./anthropic");
    const nodes: DraftGuideNode[] = Array.from({ length: 45 }, (_, i) => ({
      temp_id: `n${i}`,
      title: `Node ${i}`,
      is_root: i === 0,
      options: Array.from({ length: 10 }, (_, j) => ({
        label: `Option ${j}`,
        outcome: "continue",
        // Option 0 points at a node that survives the cap, option 1 at one that doesn't.
        next_temp_id: j === 0 ? "n1" : "n44",
      })),
    }));

    const result = normalizeDraftNodes(nodes);
    expect(result).toHaveLength(MAX_GUIDE_STEPS);
    expect(result[0].options).toHaveLength(MAX_GUIDE_OPTIONS_PER_STEP);
    expect(result[0].options[0]).toMatchObject({ outcome: "continue", nextTempId: "n1" });
    expect(result[0].options[1]).toMatchObject({ outcome: "escalate", nextTempId: null });
  });
});

describe("guideGraphSchema", () => {
  const validGraph = [
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
      options: [
        { label: "Fixed", outcome: "resolved", nextTempId: null },
        { label: "Still broken", outcome: "escalate", nextTempId: null },
      ],
    },
  ];

  it("accepts a well-formed graph and yields the GuideGraphNode shape", async () => {
    const { guideGraphSchema } = await import("./anthropic");
    const parsed = guideGraphSchema.safeParse(validGraph);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toEqual(validGraph);
  });

  it("rejects duplicate tempIds", async () => {
    const { guideGraphSchema } = await import("./anthropic");
    const parsed = guideGraphSchema.safeParse([validGraph[0], { ...validGraph[1], tempId: "n1" }]);
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0].message).toMatch(/share the id "n1"/);
  });

  it("rejects two roots (and no root)", async () => {
    const { guideGraphSchema } = await import("./anthropic");
    const twoRoots = guideGraphSchema.safeParse([validGraph[0], { ...validGraph[1], isRoot: true }]);
    expect(twoRoots.success).toBe(false);
    if (!twoRoots.success) expect(twoRoots.error.issues[0].message).toMatch(/Only one step can be the start/);

    const noRoot = guideGraphSchema.safeParse([{ ...validGraph[0], isRoot: false }, validGraph[1]]);
    expect(noRoot.success).toBe(false);
    if (!noRoot.success) expect(noRoot.error.issues[0].message).toMatch(/must be marked as the start/);
  });

  it("rejects a 'continue' whose target isn't in the graph (dangling or null)", async () => {
    const { guideGraphSchema } = await import("./anthropic");
    const dangling = guideGraphSchema.safeParse([
      { ...validGraph[0], options: [{ label: "Go", outcome: "continue", nextTempId: "ghost" }] },
      validGraph[1],
    ]);
    expect(dangling.success).toBe(false);
    if (!dangling.success) expect(dangling.error.issues[0].message).toMatch(/"Go" continues to a step that isn't in this guide/);

    const nullTarget = guideGraphSchema.safeParse([
      { ...validGraph[0], options: [{ label: "Go", outcome: "continue", nextTempId: null }] },
      validGraph[1],
    ]);
    expect(nullTarget.success).toBe(false);
  });

  it("rejects a terminal option that still carries a nextTempId, and non-enum outcomes", async () => {
    const { guideGraphSchema } = await import("./anthropic");
    const terminalWithTarget = guideGraphSchema.safeParse([
      { ...validGraph[0], options: [{ label: "Done", outcome: "resolved", nextTempId: "n2" }] },
      validGraph[1],
    ]);
    expect(terminalWithTarget.success).toBe(false);

    const badOutcome = guideGraphSchema.safeParse([
      { ...validGraph[0], options: [{ label: "Hmm", outcome: "retry", nextTempId: null }] },
      validGraph[1],
    ]);
    expect(badOutcome.success).toBe(false);
  });

  it("rejects an empty graph, blank titles/labels, and oversized graphs", async () => {
    const { guideGraphSchema, MAX_GUIDE_STEPS } = await import("./anthropic");
    expect(guideGraphSchema.safeParse([]).success).toBe(false);
    expect(guideGraphSchema.safeParse([{ ...validGraph[0], title: "   ", options: [] }]).success).toBe(false);
    expect(
      guideGraphSchema.safeParse([{ ...validGraph[0], options: [{ label: " ", outcome: "escalate", nextTempId: null }] }]).success
    ).toBe(false);
    const tooMany = Array.from({ length: MAX_GUIDE_STEPS + 1 }, (_, i) => ({
      tempId: `n${i}`,
      title: `Node ${i}`,
      instructions: null,
      isRoot: i === 0,
      options: [],
    }));
    expect(guideGraphSchema.safeParse(tooMany).success).toBe(false);
  });

  it("whatever normalizeDraftNodes emits passes guideGraphSchema", async () => {
    const { guideGraphSchema, normalizeDraftNodes } = await import("./anthropic");
    const messy: DraftGuideNode[] = [
      { temp_id: "a", title: "Root", is_root: true, options: [{ label: "Go", outcome: "continue", next_temp_id: "b" }] },
      { temp_id: "b", title: "B", is_root: true, options: [{ label: "Weird", outcome: "retry", next_temp_id: "zzz" }] },
      { temp_id: "b", title: "Dup", options: undefined },
      { temp_id: "c", title: "C", options: [{ label: "", outcome: "resolved", next_temp_id: null }] },
    ];
    expect(guideGraphSchema.safeParse(normalizeDraftNodes(messy)).success).toBe(true);
  });
});

describe("draftTroubleshootingGuide", () => {
  const createMock = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    createMock.mockReset();
    process.env.ANTHROPIC_API_KEY = "test-key";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

    vi.doMock("@anthropic-ai/sdk", () => ({
      default: class MockAnthropic {
        messages = { create: createMock };
      },
    }));
  });

  it("normalizes the SDK's tool_use response into a safe guide graph", async () => {
    createMock.mockResolvedValue({
      content: [
        {
          type: "tool_use",
          input: {
            nodes: [
              {
                temp_id: "n1",
                title: "Symptom?",
                instructions: "",
                is_root: true,
                options: [{ label: "Leaking", outcome: "continue", next_temp_id: "ghost" }],
              },
            ],
          },
        },
      ],
    });

    const { draftTroubleshootingGuide } = await import("./anthropic");
    const result = await draftTroubleshootingGuide({
      equipmentTypeName: "Water heater",
      description: "",
      commonIssues: "",
    });

    expect(result).toHaveLength(1);
    // The referenced node doesn't exist in this draft — must not produce a dead end.
    expect(result[0].options[0].outcome).toBe("escalate");
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("drops a malformed node (and a malformed option) instead of failing the whole draft", async () => {
    createMock.mockResolvedValue({
      content: [
        {
          type: "tool_use",
          input: {
            nodes: [
              { temp_id: "n1", title: "Symptom?", is_root: true, options: [{ label: "Leaking", outcome: "continue", next_temp_id: "n2" }] },
              // No temp_id at all — can't be referenced or inserted, dropped.
              { title: "Orphan", is_root: false, options: [] },
              // A non-object where a node should be.
              "garbage",
              // Missing options entirely + one option that isn't an object.
              { temp_id: "n2", title: "Check the drain", instructions: null },
              { temp_id: "n3", title: "Look for water", options: [42, { label: "Dry", outcome: "resolved", next_temp_id: null }] },
            ],
          },
        },
      ],
    });

    const { draftTroubleshootingGuide } = await import("./anthropic");
    const result = await draftTroubleshootingGuide({ equipmentTypeName: "Ice machine", description: "", commonIssues: "" });

    expect(result.map((n) => n.tempId)).toEqual(["n1", "n2", "n3"]);
    expect(result[0].options[0]).toEqual({ label: "Leaking", outcome: "continue", nextTempId: "n2" });
    expect(result[1].options).toEqual([]);
    expect(result[2].options).toEqual([{ label: "Dry", outcome: "resolved", nextTempId: null }]);
  });

  it("throws when the tool input isn't the expected shape at all", async () => {
    createMock.mockResolvedValue({ content: [{ type: "tool_use", input: { nodes: "not an array" } }] });

    const { draftTroubleshootingGuide } = await import("./anthropic");
    await expect(
      draftTroubleshootingGuide({ equipmentTypeName: "Fridge", description: "", commonIssues: "" })
    ).rejects.toThrow(/empty guide/i);
  });

  it("throws when the model doesn't return a tool_use block", async () => {
    createMock.mockResolvedValue({ content: [{ type: "text", text: "sorry, I can't do that" }] });

    const { draftTroubleshootingGuide } = await import("./anthropic");
    await expect(
      draftTroubleshootingGuide({ equipmentTypeName: "Fridge", description: "", commonIssues: "" })
    ).rejects.toThrow(/didn't return a guide/i);
  });

  it("throws when the model proposes zero nodes", async () => {
    createMock.mockResolvedValue({
      content: [{ type: "tool_use", input: { nodes: [] } }],
    });

    const { draftTroubleshootingGuide } = await import("./anthropic");
    await expect(
      draftTroubleshootingGuide({ equipmentTypeName: "Fridge", description: "", commonIssues: "" })
    ).rejects.toThrow(/empty guide/i);
  });

  it("system prompt hard-bans unsafe instructions and routes hazard symptoms to a stop-and-call escalation", async () => {
    createMock.mockResolvedValue({
      content: [{ type: "tool_use", input: { nodes: [{ temp_id: "n1", title: "Symptom?", instructions: "", is_root: true, options: [] }] } }],
    });

    const { draftTroubleshootingGuide } = await import("./anthropic");
    await draftTroubleshootingGuide({ equipmentTypeName: "Water heater", description: "", commonIssues: "" });

    const system = createMock.mock.calls[0][0].system as string;
    // Never open it up, touch it, or defeat a safety device.
    expect(system).toMatch(/open a panel or cover/i);
    expect(system).toMatch(/bypass or reset a safety device/i);
    // A hazard symptom terminates in a stop/keep clear/call escalation.
    expect(system).toMatch(/gas smell/i);
    expect(system).toMatch(/burning smell/i);
    expect(system).toMatch(/smoke/i);
    expect(system).toMatch(/sparking/i);
    expect(system).toMatch(/steam leak/i);
    expect(system).toMatch(/refrigerant leak/i);
    expect(system).toMatch(/stop, keep clear/i);
    expect(system).toMatch(/emergency services/i);
  });
});

describe("generateChecklistDraft", () => {
  const createMock = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    createMock.mockReset();
    process.env.ANTHROPIC_API_KEY = "test-key";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

    vi.doMock("@anthropic-ai/sdk", () => ({
      default: class MockAnthropic {
        messages = { create: createMock };
      },
    }));
  });

  it("returns items with no id, trimmed labels, and falls back to 'check' for a bad kind", async () => {
    createMock.mockResolvedValue({
      content: [
        {
          type: "tool_use",
          input: {
            items: [
              { label: "  Descale boiler  ", kind: "check", required: true, help: null },
              { label: "Group gasket condition", kind: "bogus-kind", required: false, help: " Look for cracks " },
            ],
          },
        },
      ],
    });

    const { generateChecklistDraft } = await import("./anthropic");
    const result = await generateChecklistDraft({
      equipmentTypeName: "Espresso machine",
      equipmentTypeDescription: "",
      purpose: "",
    });

    expect(result).toEqual([
      { label: "Descale boiler", kind: "check", required: true, help: null },
      { label: "Group gasket condition", kind: "check", required: false, help: "Look for cracks" },
    ]);
    expect(result[0]).not.toHaveProperty("id");
  });

  it("caps drafts at 15 items", async () => {
    createMock.mockResolvedValue({
      content: [
        {
          type: "tool_use",
          input: {
            items: Array.from({ length: 20 }, (_, i) => ({
              label: `Item ${i}`,
              kind: "check",
              required: false,
              help: null,
            })),
          },
        },
      ],
    });

    const { generateChecklistDraft } = await import("./anthropic");
    const result = await generateChecklistDraft({
      equipmentTypeName: "Boiler",
      equipmentTypeDescription: "",
      purpose: "",
    });
    expect(result).toHaveLength(15);
  });

  it("throws when the model doesn't return a tool_use block", async () => {
    createMock.mockResolvedValue({ content: [{ type: "text", text: "no" }] });

    const { generateChecklistDraft } = await import("./anthropic");
    await expect(
      generateChecklistDraft({ equipmentTypeName: "Fridge", equipmentTypeDescription: "", purpose: "" })
    ).rejects.toThrow(/didn't return a checklist/i);
  });

  it("throws when the model returns zero items", async () => {
    createMock.mockResolvedValue({
      content: [{ type: "tool_use", input: { items: [] } }],
    });

    const { generateChecklistDraft } = await import("./anthropic");
    await expect(
      generateChecklistDraft({ equipmentTypeName: "Fridge", equipmentTypeDescription: "", purpose: "" })
    ).rejects.toThrow(/empty checklist/i);
  });

  it("system prompt hard-bans unsafe checklist items and hazard investigation", async () => {
    createMock.mockResolvedValue({
      content: [{ type: "tool_use", input: { items: [{ label: "x", kind: "check", required: false, help: null }] } }],
    });

    const { generateChecklistDraft } = await import("./anthropic");
    await generateChecklistDraft({ equipmentTypeName: "Fryer", equipmentTypeDescription: "", purpose: "" });

    const system = createMock.mock.calls[0][0].system as string;
    expect(system).toMatch(/electrical panel or enclosure/i);
    expect(system).toMatch(/bypass or reset a safety device/i);
    expect(system).toMatch(/licensed-trade tasks/i);
    expect(system).toMatch(/gas smell/i);
    expect(system).toMatch(/steam leak/i);
    expect(system).toMatch(/refrigerant leak/i);
    expect(system).toMatch(/stop, keep clear/i);
    expect(system).toMatch(/emergency services/i);
  });
});

describe("summarizeTroubleshootingPath", () => {
  const createMock = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    createMock.mockReset();
    process.env.ANTHROPIC_API_KEY = "test-key";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

    vi.doMock("@anthropic-ai/sdk", () => ({
      default: class MockAnthropic {
        messages = { create: createMock };
      },
    }));
  });

  it("uses the cheap classifier model with a short timeout and one retry (Q-05: runs inline in the public submit request)", async () => {
    createMock.mockResolvedValue({ content: [{ type: "text", text: "Tried resetting the breaker; still won't start." }] });

    const { summarizeTroubleshootingPath } = await import("./anthropic");
    const result = await summarizeTroubleshootingPath({
      equipmentName: "Ice machine",
      description: "Won't start",
      path: [{ question: "Tried resetting?", answer: "Yes" }],
    });

    expect(result).toBe("Tried resetting the breaker; still won't start.");
    expect(createMock).toHaveBeenCalledTimes(1);
    const [params, options] = createMock.mock.calls[0];
    expect(params.model).toBe("claude-haiku-4-5-20251001");
    expect(options).toEqual({ timeout: 8_000, maxRetries: 1 });
  });

  it("returns null instead of throwing when the SDK call fails", async () => {
    createMock.mockRejectedValue(new Error("network error"));

    const { summarizeTroubleshootingPath } = await import("./anthropic");
    const result = await summarizeTroubleshootingPath({
      equipmentName: "Ice machine",
      description: "Won't start",
      path: [],
    });

    expect(result).toBeNull();
  });

  it("returns null when the model responds with no text block", async () => {
    createMock.mockResolvedValue({ content: [{ type: "tool_use", input: {} }] });

    const { summarizeTroubleshootingPath } = await import("./anthropic");
    const result = await summarizeTroubleshootingPath({
      equipmentName: "Ice machine",
      description: "Won't start",
      path: [],
    });

    expect(result).toBeNull();
  });
});
