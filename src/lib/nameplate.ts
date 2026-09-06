// Scan-to-onboard nameplate OCR: a staff member photographs the data plate
// on a piece of equipment and Claude vision reads what's printed on it, so
// the "add equipment" form on /e/[qrToken]/onboard starts prefilled instead
// of blank. Called only from POST /api/nameplate (staff-authenticated,
// rate-limited) — never from the browser directly, since it needs
// ANTHROPIC_API_KEY.
//
// Deliberately independent of src/lib/anthropic.ts (workstream D appends
// there for the checklist generator) rather than sharing its client/model
// constant — see docs/AGENT-BRIEF.md's shared-file rules. VISION_MODEL below
// is intentionally the same value as anthropic.ts's DRAFTING_MODEL: it must
// be a vision-capable model, and this one already is.

import Anthropic from "@anthropic-ai/sdk";
import { serverEnv } from "@/lib/env";

let client: Anthropic | null = null;

function getClient() {
  const apiKey = serverEnv.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }
  if (!client) {
    client = new Anthropic({ apiKey });
  }
  return client;
}

/** Must be vision-capable. Same value as src/lib/anthropic.ts's DRAFTING_MODEL. */
export const VISION_MODEL = "claude-sonnet-5";

export type NameplateConfidence = "low" | "normal" | "high";

export type NameplateFields = {
  make: string | null;
  model: string | null;
  serial_number: string | null;
  voltage: string | null;
  year: string | null;
  /** Anything else worth keeping that doesn't have its own field (capacity, refrigerant, BTU, etc.). */
  other_notes: string | null;
  confidence: NameplateConfidence;
};

/** Accepted by the Anthropic image content block (Base64ImageSource). We only ever send what client-image.ts's downscaleToJpeg produces, but accept the other two too. */
export type NameplateMediaType = "image/jpeg" | "image/png" | "image/webp";

export type ExtractNameplateInput = {
  /** Base64-encoded image bytes, no `data:` prefix (see src/lib/client-image.ts blobToBase64). */
  base64: string;
  mediaType: NameplateMediaType;
};

function cleanField(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Coerces whatever the model's tool_use call returned into a safe, fully
 * nullable NameplateFields — pure, so it's covered without mocking the SDK.
 */
export function normalizeNameplateFields(
  raw: Partial<Record<keyof NameplateFields, unknown>> | null | undefined
): NameplateFields {
  const confidence =
    raw?.confidence === "low" || raw?.confidence === "high" ? raw.confidence : "normal";

  return {
    make: cleanField(raw?.make),
    model: cleanField(raw?.model),
    serial_number: cleanField(raw?.serial_number),
    voltage: cleanField(raw?.voltage),
    year: cleanField(raw?.year),
    other_notes: cleanField(raw?.other_notes),
    confidence,
  };
}

/**
 * Reads an equipment nameplate/data plate photo with Claude vision and
 * returns whatever fields it could confidently make out. Every field is
 * nullable by design — a technician always has the "skip, fill in by hand"
 * path in the UI, so a partial or empty read is a fine outcome, never an
 * error to throw over.
 */
export async function extractNameplate(input: ExtractNameplateInput): Promise<NameplateFields> {
  const anthropic = getClient();

  const message = await anthropic.messages.create({
    model: VISION_MODEL,
    max_tokens: 512,
    system: [
      "You read equipment nameplates/data plates from a photo taken by a field service technician standing at the machine.",
      "Extract only what is actually printed on the plate. Never guess, infer, or complete a partially visible value.",
      "Leave a field null when it isn't on the plate, is illegible, or you aren't reasonably confident.",
      "'confidence' describes the whole read: 'high' if every field you filled in is clearly legible, 'low' if the photo is blurry, glared, or the plate is partly obscured, 'normal' otherwise.",
    ].join(" "),
    tools: [
      {
        name: "record_nameplate",
        description: "Record the fields read off an equipment nameplate photo.",
        input_schema: {
          type: "object",
          properties: {
            make: { type: ["string", "null"], description: "Manufacturer / brand name" },
            model: { type: ["string", "null"], description: "Model number" },
            serial_number: { type: ["string", "null"] },
            voltage: {
              type: ["string", "null"],
              description: "Electrical rating as printed, e.g. \"240V 60Hz 1PH\"",
            },
            year: { type: ["string", "null"], description: "Manufacture date or year, if printed" },
            other_notes: {
              type: ["string", "null"],
              description:
                "Anything else on the plate worth keeping as a short line — capacity, refrigerant type, BTU rating, etc. Null if nothing else stands out.",
            },
            confidence: { type: "string", enum: ["low", "normal", "high"] },
          },
          required: ["make", "model", "serial_number", "voltage", "year", "other_notes", "confidence"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "record_nameplate" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: input.mediaType, data: input.base64 },
          },
          {
            type: "text",
            text: "This is a photo of an equipment nameplate/data plate. Extract its fields.",
          },
        ],
      },
    ],
  });

  const toolUse = message.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("The model didn't return nameplate fields");
  }

  return normalizeNameplateFields(
    toolUse.input as Partial<Record<keyof NameplateFields, unknown>>
  );
}

// ----------------------------------------------------------------------------
// Prefill / persistence helpers — pure, no SDK, safe to unit test directly.
// ----------------------------------------------------------------------------

export type NameplateEquipmentDraft = {
  /** "<make> <model>", trimmed; empty string when neither is known — the form still requires a name. */
  name: string;
  make: string | null;
  model: string | null;
  serialNumber: string | null;
  /** `{ nameplate: {...} }` for whatever doesn't have its own equipment column (voltage/year/other notes) — undefined when there's nothing extra to store. */
  customFields: { nameplate: Record<string, string> } | undefined;
};

/**
 * Turns a nameplate read into the equipment-form prefill: a default name,
 * the columns that map directly, and a `custom_fields` shape for the rest.
 * Pure — used both to seed the onboarding form on the client and, server
 * side, to build the `custom_fields` the equipment insert stores.
 */
export function nameplateToEquipmentDraft(fields: NameplateFields): NameplateEquipmentDraft {
  const name = [fields.make, fields.model].filter(Boolean).join(" ").trim();

  const extra: Record<string, string> = {};
  if (fields.voltage) extra.voltage = fields.voltage;
  if (fields.year) extra.year = fields.year;
  if (fields.other_notes) extra.other_notes = fields.other_notes;

  return {
    name,
    make: fields.make,
    model: fields.model,
    serialNumber: fields.serial_number,
    customFields: Object.keys(extra).length > 0 ? { nameplate: extra } : undefined,
  };
}

/** Raw image bytes accepted by POST /api/nameplate, before base64 inflates it ~4/3. */
export const MAX_NAMEPLATE_IMAGE_BYTES = 4 * 1024 * 1024;

/** The base64 string length that corresponds to MAX_NAMEPLATE_IMAGE_BYTES of raw bytes. */
export const MAX_NAMEPLATE_BASE64_LENGTH = Math.ceil(MAX_NAMEPLATE_IMAGE_BYTES / 3) * 4;
