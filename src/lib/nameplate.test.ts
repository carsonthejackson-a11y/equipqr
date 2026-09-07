import { describe, expect, it, vi, beforeEach } from "vitest";
import type { NameplateFields } from "./nameplate";

describe("normalizeNameplateFields", () => {
  it("trims strings and treats blank/whitespace-only values as null", async () => {
    const { normalizeNameplateFields } = await import("./nameplate");
    const result = normalizeNameplateFields({
      make: "  Rheem  ",
      model: "",
      serial_number: "   ",
      voltage: "240V",
      year: null,
      other_notes: undefined,
      confidence: "high",
    });

    expect(result).toEqual({
      make: "Rheem",
      model: null,
      serial_number: null,
      voltage: "240V",
      year: null,
      other_notes: null,
      confidence: "high",
    });
  });

  it("defaults confidence to 'normal' for anything but 'low'/'high'", async () => {
    const { normalizeNameplateFields } = await import("./nameplate");
    expect(normalizeNameplateFields({ confidence: "sort of sure" }).confidence).toBe("normal");
    expect(normalizeNameplateFields(null).confidence).toBe("normal");
    expect(normalizeNameplateFields(undefined).confidence).toBe("normal");
  });

  it("rejects non-string field values rather than throwing", async () => {
    const { normalizeNameplateFields } = await import("./nameplate");
    const result = normalizeNameplateFields({ make: 42, model: { not: "a string" } });
    expect(result.make).toBeNull();
    expect(result.model).toBeNull();
  });
});

describe("nameplateToEquipmentDraft", () => {
  it("joins make + model into a default name", async () => {
    const { nameplateToEquipmentDraft } = await import("./nameplate");
    const fields: NameplateFields = {
      make: "Rheem",
      model: "XG40T06",
      serial_number: "SN123",
      voltage: null,
      year: null,
      other_notes: null,
      confidence: "high",
    };

    const draft = nameplateToEquipmentDraft(fields);
    expect(draft.name).toBe("Rheem XG40T06");
    expect(draft.make).toBe("Rheem");
    expect(draft.model).toBe("XG40T06");
    expect(draft.serialNumber).toBe("SN123");
    expect(draft.customFields).toBeUndefined();
  });

  it("falls back to an empty name when neither make nor model is known", async () => {
    const { nameplateToEquipmentDraft } = await import("./nameplate");
    const fields: NameplateFields = {
      make: null,
      model: null,
      serial_number: null,
      voltage: null,
      year: null,
      other_notes: null,
      confidence: "low",
    };

    expect(nameplateToEquipmentDraft(fields).name).toBe("");
  });

  it("collects voltage/year/other_notes into custom_fields.nameplate, omitting unset ones", async () => {
    const { nameplateToEquipmentDraft } = await import("./nameplate");
    const fields: NameplateFields = {
      make: "Trane",
      model: null,
      serial_number: null,
      voltage: "240V 60Hz",
      year: null,
      other_notes: "R-410A refrigerant",
      confidence: "normal",
    };

    const draft = nameplateToEquipmentDraft(fields);
    expect(draft.customFields).toEqual({
      nameplate: { voltage: "240V 60Hz", other_notes: "R-410A refrigerant" },
    });
  });

  it("leaves customFields undefined when there is nothing beyond make/model/serial", async () => {
    const { nameplateToEquipmentDraft } = await import("./nameplate");
    const fields: NameplateFields = {
      make: null,
      model: null,
      serial_number: "SN1",
      voltage: null,
      year: null,
      other_notes: null,
      confidence: "normal",
    };

    expect(nameplateToEquipmentDraft(fields).customFields).toBeUndefined();
  });
});

describe("extractNameplate", () => {
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

  it("sends the image as a base64 content block alongside the tool-use schema", async () => {
    createMock.mockResolvedValue({
      content: [
        {
          type: "tool_use",
          input: {
            make: "Rheem",
            model: "XG40T06",
            serial_number: "SN123",
            voltage: null,
            year: null,
            other_notes: null,
            confidence: "high",
          },
        },
      ],
    });

    const { extractNameplate, VISION_MODEL } = await import("./nameplate");
    const result = await extractNameplate({ base64: "ZmFrZS1pbWFnZS1ieXRlcw==", mediaType: "image/jpeg" });

    expect(result).toEqual({
      make: "Rheem",
      model: "XG40T06",
      serial_number: "SN123",
      voltage: null,
      year: null,
      other_notes: null,
      confidence: "high",
    });

    expect(createMock).toHaveBeenCalledTimes(1);
    const call = createMock.mock.calls[0][0];
    expect(call.model).toBe(VISION_MODEL);
    expect(call.tool_choice).toEqual({ type: "tool", name: "record_nameplate" });
    expect(call.tools[0].name).toBe("record_nameplate");

    const userMessage = call.messages[0];
    expect(userMessage.role).toBe("user");
    const imageBlock = userMessage.content.find((block: { type: string }) => block.type === "image");
    expect(imageBlock).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: "ZmFrZS1pbWFnZS1ieXRlcw==" },
    });
    const textBlock = userMessage.content.find((block: { type: string }) => block.type === "text");
    expect(textBlock?.text).toMatch(/nameplate/i);
  });

  it("throws when the model doesn't return a tool_use block", async () => {
    createMock.mockResolvedValue({ content: [{ type: "text", text: "I can't read that" }] });

    const { extractNameplate } = await import("./nameplate");
    await expect(
      extractNameplate({ base64: "abc", mediaType: "image/jpeg" })
    ).rejects.toThrow(/didn't return nameplate fields/i);
  });

  it("throws a clear error when ANTHROPIC_API_KEY isn't configured", async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const { extractNameplate } = await import("./nameplate");
    await expect(
      extractNameplate({ base64: "abc", mediaType: "image/jpeg" })
    ).rejects.toThrow(/ANTHROPIC_API_KEY/);
    expect(createMock).not.toHaveBeenCalled();
  });
});
