import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { serverEnv } from "@/lib/env";
import type { ChecklistItem, ChecklistItemKind, GuideGraphNode } from "./types";

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

const DRAFTING_MODEL = "claude-sonnet-5";
const CLASSIFIER_MODEL = "claude-haiku-4-5-20251001";

// What the model's propose_guide tool call is *asked* to contain. Every
// field the model can plausibly omit or get wrong is optional or loose here
// (no `is_root`, no `options`, an outcome outside the enum) so the raw draft
// is typed honestly — normalizeDraftNodes() below is what turns it into a
// GuideGraphNode that's safe to insert.
export type DraftGuideNode = {
  temp_id: string;
  title: string;
  instructions?: string | null;
  is_root?: boolean;
  options?: { label: string; outcome: string; next_temp_id: string | null }[];
};

// Shared with guideGraphSchema below so a draft that survives normalization
// always passes the graph validation replaceGuideGraph() runs on it.
export const MAX_GUIDE_STEPS = 40;
export const MAX_GUIDE_OPTIONS_PER_STEP = 8;
const MAX_GUIDE_TEMP_ID_LENGTH = 64;
const MAX_GUIDE_TITLE_LENGTH = 200;
const MAX_GUIDE_INSTRUCTIONS_LENGTH = 4000;
const MAX_GUIDE_OPTION_LABEL_LENGTH = 120;

// The tool-use input is model output, not a trusted payload: it's parsed
// (never cast) and each node — and each option inside a node — is checked on
// its own, so one garbled entry costs that entry, not the whole draft.
const proposeGuideInputSchema = z.object({ nodes: z.array(z.unknown()) });

const draftGuideOptionSchema = z.object({
  label: z.string().max(MAX_GUIDE_OPTION_LABEL_LENGTH),
  outcome: z.string(),
  next_temp_id: z.string().nullish(),
});

const draftGuideNodeSchema = z.object({
  temp_id: z.string().min(1).max(MAX_GUIDE_TEMP_ID_LENGTH),
  title: z.string().trim().min(1).max(MAX_GUIDE_TITLE_LENGTH),
  instructions: z.string().max(MAX_GUIDE_INSTRUCTIONS_LENGTH).nullish(),
  is_root: z.boolean().optional(),
  options: z.array(z.unknown()).optional(),
});

function parseDraftNodes(input: unknown): DraftGuideNode[] {
  const parsed = proposeGuideInputSchema.safeParse(input);
  if (!parsed.success) return [];

  return parsed.data.nodes.flatMap((rawNode) => {
    const node = draftGuideNodeSchema.safeParse(rawNode);
    if (!node.success) return [];

    const options = (node.data.options ?? []).flatMap((rawOption) => {
      const option = draftGuideOptionSchema.safeParse(rawOption);
      return option.success ? [{ ...option.data, next_temp_id: option.data.next_temp_id ?? null }] : [];
    });
    return [{ ...node.data, options }];
  });
}

export async function draftTroubleshootingGuide({
  equipmentTypeName,
  description,
  commonIssues,
}: {
  equipmentTypeName: string;
  description: string;
  commonIssues: string;
}): Promise<GuideGraphNode[]> {
  const anthropic = getClient();

  const message = await anthropic.messages.create({
    model: DRAFTING_MODEL,
    max_tokens: 4096,
    system: [
      "You design branching troubleshooting guides for a field service company's customer-facing QR code app.",
      "The guide is a decision tree: the root node is a short multiple-choice list of symptoms (e.g. \"Not heating\", \"Leaking\", \"Clogged\").",
      "Every other node is a short check or instruction, ending in a few labeled options.",
      "Each option either continues to another node, ends the flow marked 'resolved', or 'escalate's straight to a service request.",
      "Keep titles and option labels short (a few words) — a customer taps through these on a phone.",
      "Every node needs at least one option that eventually reaches 'resolved' or 'escalate' — don't create dead ends.",
      "Every 'continue' option's next_temp_id must reference the temp_id of another node in the same response.",
      "Exactly one node must have is_root set to true.",
      // Safety rules, no exceptions (a guide step is instructions a customer
      // follows alone, on their phone, next to the equipment — never treat
      // this like a technician manual).
      "Never write an instruction telling the customer to open a panel or cover, touch anything electrical, gas, refrigerant, pressurized, steam, or hot, or to bypass or reset a safety device (a limit switch, pressure relief valve, gas shutoff, breaker, etc.). Looking at, listening to, or smelling near the equipment from a safe distance is fine; opening it up or touching its internals is not.",
      "If a symptom is a hazard — a gas smell, a burning smell, smoke, sparking, water pooling near anything electrical, a steam leak, or a refrigerant leak — the option for it must lead straight to a terminal node whose instructions tell the customer to stop, keep clear of the equipment, and call the service company immediately, with outcome 'escalate'; for a gas smell or any sign of fire, that node must also tell them to call emergency services (fire department / gas utility) before anything else.",
    ].join(" "),
    tools: [
      {
        name: "propose_guide",
        description: "Propose a branching troubleshooting guide as a graph of nodes.",
        input_schema: {
          type: "object",
          properties: {
            nodes: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  temp_id: { type: "string", description: "Short unique id, e.g. 'n1'" },
                  title: { type: "string" },
                  instructions: {
                    type: "string",
                    description: "What the customer should check or do. Empty string if none (e.g. the root question).",
                  },
                  is_root: { type: "boolean" },
                  options: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        label: { type: "string" },
                        outcome: { type: "string", enum: ["continue", "resolved", "escalate"] },
                        next_temp_id: {
                          type: ["string", "null"],
                          description: "Required (another node's temp_id) when outcome is 'continue', otherwise null.",
                        },
                      },
                      required: ["label", "outcome", "next_temp_id"],
                    },
                  },
                },
                required: ["temp_id", "title", "instructions", "is_root", "options"],
              },
            },
          },
          required: ["nodes"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "propose_guide" },
    messages: [
      {
        role: "user",
        content: [
          `Equipment type: ${equipmentTypeName}`,
          description ? `Description: ${description}` : null,
          commonIssues ? `Common issues reported: ${commonIssues}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
  });

  const toolUse = message.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("The model didn't return a guide");
  }

  const rawNodes = parseDraftNodes(toolUse.input);
  if (rawNodes.length === 0) {
    throw new Error("The model returned an empty guide");
  }

  return normalizeDraftNodes(rawNodes);
}

// Pure — no network, no SDK. Cleans up whatever the model proposed into a
// graph that's safe to insert: exactly one root, and every "continue"
// option pointing at a real node in the same draft (anything else becomes
// "escalate" so it can't produce a dead end or a dangling reference that
// would violate a DB check constraint later).
//
// "Exactly one" root matters more than it looks: guide_steps_one_root_per_type
// is a unique index, and replaceGuideGraph() deletes the old guide before it
// inserts the new one — so a draft with two roots used to fail on the second
// insert and leave the type with no guide at all. Same story for duplicate
// temp_ids (options resolved next_temp_id to the wrong step) and a node with
// no options array at all (`.map` threw before anything was shown).
export function normalizeDraftNodes(rawNodes: DraftGuideNode[]): GuideGraphNode[] {
  // First occurrence of a temp_id wins; capped so a runaway draft can't
  // blow past what the guide editor (and guideGraphSchema) will accept.
  const nodes: DraftGuideNode[] = [];
  const seenTempIds = new Set<string>();
  for (const node of rawNodes) {
    if (seenTempIds.has(node.temp_id)) continue;
    seenTempIds.add(node.temp_id);
    nodes.push(node);
    if (nodes.length === MAX_GUIDE_STEPS) break;
  }

  // Exactly one root: the first node the model marked, else the first node.
  const firstMarkedRoot = nodes.findIndex((node) => node.is_root === true);
  const rootIndex = firstMarkedRoot === -1 ? 0 : firstMarkedRoot;

  return nodes.map((node, index) => ({
    tempId: node.temp_id,
    title: node.title,
    instructions: node.instructions?.trim() || null,
    isRoot: index === rootIndex,
    options: normalizeDraftOptions(node.options, seenTempIds),
  }));
}

function normalizeDraftOptions(
  options: DraftGuideNode["options"],
  validTempIds: Set<string>
): GuideGraphNode["options"] {
  // Tolerates a missing (or non-array) options list — a step with no
  // options is a legal dead end the owner can fix in the editor.
  if (!Array.isArray(options)) return [];

  const result: GuideGraphNode["options"] = [];
  for (const option of options) {
    if (!option || typeof option !== "object") continue;
    const label = typeof option.label === "string" ? option.label.trim() : "";
    if (!label) continue;

    // A "continue" option must resolve to a real node in this same draft, or
    // the DB insert will violate guide_options_continue_needs_target later.
    const nextTempId =
      typeof option.next_temp_id === "string" && validTempIds.has(option.next_temp_id)
        ? option.next_temp_id
        : null;

    if (option.outcome === "continue" && nextTempId) {
      result.push({ label, outcome: "continue", nextTempId });
    } else if (option.outcome === "resolved") {
      result.push({ label, outcome: "resolved", nextTempId: null });
    } else {
      // "escalate", a "continue" with no usable target, or an outcome the
      // model made up — escalating to a service request is the one outcome
      // that's always safe.
      result.push({ label, outcome: "escalate", nextTempId: null });
    }
    if (result.length === MAX_GUIDE_OPTIONS_PER_STEP) break;
  }
  return result;
}

// Validation for a whole guide graph as replaceGuideGraph() receives it from
// the client (the AI drafter's "Use this draft"). Lives here next to
// normalizeDraftNodes() rather than in the server action so it's unit-
// testable without a Supabase client, and so the two stay in step: whatever
// the normalizer emits must pass this, because replaceGuideGraph() runs it
// BEFORE deleting the live guide — a graph that fails a DB constraint
// mid-insert (second root, dangling continue) would otherwise leave the
// type half-replaced.
export const guideGraphSchema = z
  .array(
    z.object({
      tempId: z.string().min(1).max(MAX_GUIDE_TEMP_ID_LENGTH),
      title: z
        .string()
        .trim()
        .min(1, "Every step needs a title")
        .max(MAX_GUIDE_TITLE_LENGTH, `Step titles can be at most ${MAX_GUIDE_TITLE_LENGTH} characters`),
      instructions: z
        .string()
        .max(MAX_GUIDE_INSTRUCTIONS_LENGTH, `Step instructions can be at most ${MAX_GUIDE_INSTRUCTIONS_LENGTH} characters`)
        .nullable(),
      isRoot: z.boolean(),
      options: z
        .array(
          z.object({
            label: z
              .string()
              .trim()
              .min(1, "Every option needs a label")
              .max(MAX_GUIDE_OPTION_LABEL_LENGTH, `Option labels can be at most ${MAX_GUIDE_OPTION_LABEL_LENGTH} characters`),
            outcome: z.enum(["continue", "resolved", "escalate"]),
            nextTempId: z.string().nullable(),
          })
        )
        .max(MAX_GUIDE_OPTIONS_PER_STEP, `A step can have at most ${MAX_GUIDE_OPTIONS_PER_STEP} options`),
    })
  )
  .min(1, "A guide needs at least one step")
  .max(MAX_GUIDE_STEPS, `A guide can have at most ${MAX_GUIDE_STEPS} steps`)
  .superRefine((nodes, ctx) => {
    const tempIds = new Set<string>();
    nodes.forEach((node, i) => {
      if (tempIds.has(node.tempId)) {
        ctx.addIssue({ code: "custom", message: `Two steps share the id "${node.tempId}"`, path: [i, "tempId"] });
      }
      tempIds.add(node.tempId);
    });

    const rootCount = nodes.filter((node) => node.isRoot).length;
    if (rootCount !== 1) {
      ctx.addIssue({
        code: "custom",
        message: rootCount === 0 ? "One step must be marked as the start" : "Only one step can be the start",
      });
    }

    nodes.forEach((node, i) => {
      node.options.forEach((option, j) => {
        const path = [i, "options", j, "nextTempId"];
        if (option.outcome === "continue") {
          if (!option.nextTempId || !tempIds.has(option.nextTempId)) {
            ctx.addIssue({
              code: "custom",
              message: `"${option.label}" continues to a step that isn't in this guide`,
              path,
            });
          }
        } else if (option.nextTempId !== null) {
          ctx.addIssue({
            code: "custom",
            message: `"${option.label}" ends the guide, so it can't also continue to a step`,
            path,
          });
        }
      });
    });
  });

export async function summarizeTroubleshootingPath({
  equipmentName,
  description,
  path,
}: {
  equipmentName: string;
  description: string;
  path: { question: string; answer: string }[];
}): Promise<string | null> {
  try {
    const anthropic = getClient();

    const pathText = path.map((entry, i) => `${i + 1}. ${entry.question} → ${entry.answer}`).join("\n");

    const message = await anthropic.messages.create(
      {
        model: CLASSIFIER_MODEL,
        max_tokens: 300,
        system:
          "You summarize a customer's self-service troubleshooting attempt for a field service technician who's about to be dispatched. Write 2-4 plain sentences: what the customer tried, and what's still wrong. No greeting, no headers, no bullet points — just the summary.",
        messages: [
          {
            role: "user",
            content: [
              `Equipment: ${equipmentName}`,
              `Customer's description: ${description}`,
              path.length > 0 ? `Troubleshooting steps taken:\n${pathText}` : "No guided troubleshooting steps were taken.",
            ].join("\n\n"),
          },
        ],
      },
      // This runs inline in the public submit request (Q-05) — a slow or
      // hanging call must not hold up the response much longer than the
      // customer would wait for "request submitted" anyway. A cheap
      // classifier model with a short timeout and a single retry: if it
      // doesn't come back quickly, the request still submits fine without a
      // summary (this function already returns null on any failure).
      { timeout: 8_000, maxRetries: 1 }
    );

    const textBlock = message.content.find((block) => block.type === "text");
    return textBlock && textBlock.type === "text" ? textBlock.text.trim() : null;
  } catch (error) {
    console.error("Failed to summarize troubleshooting path", error);
    return null;
  }
}

export async function classifyGuideOption({
  stepTitle,
  stepInstructions,
  options,
  message: customerMessage,
}: {
  stepTitle: string;
  stepInstructions: string | null;
  options: { id: string; label: string }[];
  message: string;
}): Promise<string | null> {
  if (options.length === 0) return null;

  try {
    const anthropic = getClient();
    const validIds = options.map((o) => o.id);

    const response = await anthropic.messages.create({
      model: CLASSIFIER_MODEL,
      max_tokens: 100,
      system: [
        "A customer is chatting through a troubleshooting guide for physical equipment.",
        "Match their message to the single closest option below, by meaning, not exact wording.",
        "If nothing reasonably matches, or the message is unrelated, return 'unclear'.",
        "Never invent an option that isn't listed.",
      ].join(" "),
      tools: [
        {
          name: "select_option",
          description: "Select the option that best matches the customer's message.",
          input_schema: {
            type: "object",
            properties: {
              option_id: { type: "string", enum: [...validIds, "unclear"] },
            },
            required: ["option_id"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "select_option" },
      messages: [
        {
          role: "user",
          content: [
            `Current step: ${stepTitle}`,
            stepInstructions ? `Instructions: ${stepInstructions}` : null,
            `Options:\n${options.map((o) => `- ${o.id}: ${o.label}`).join("\n")}`,
            `Customer's message: ${customerMessage}`,
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      ],
    });

    const toolUse = response.content.find((block) => block.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") return null;

    const optionId = (toolUse.input as { option_id: string }).option_id;
    return validIds.includes(optionId) ? optionId : null;
  } catch (error) {
    console.error("Failed to classify guide option", error);
    return null;
  }
}

const CHECKLIST_ITEM_KIND_VALUES: ChecklistItemKind[] = ["check", "pass_fail", "text", "number", "photo"];

type DraftChecklistItem = {
  label: string;
  kind: string;
  required: boolean;
  help: string | null;
};

/**
 * Drafts a scan-to-inspect checklist for one equipment type (Next roadmap,
 * workstream D). Returns 6-15 items with no `id` — the caller (the dashboard
 * server action) assigns real ids via src/lib/checklists.ts `newItemId()`
 * before the technician edits or saves the draft, same division of labor as
 * draftTroubleshootingGuide()/replaceGuideGraph() above.
 */
export async function generateChecklistDraft({
  equipmentTypeName,
  equipmentTypeDescription,
  purpose,
}: {
  equipmentTypeName: string;
  equipmentTypeDescription: string;
  purpose: string;
}): Promise<Omit<ChecklistItem, "id">[]> {
  const anthropic = getClient();

  const message = await anthropic.messages.create({
    model: DRAFTING_MODEL,
    max_tokens: 2048,
    system: [
      "You design inspection checklists a field-service technician fills out on their phone, standing at the equipment.",
      "Produce 6 to 15 short, concrete items.",
      "Each item has a kind: 'check' (a simple did-you-do-this checkbox), 'pass_fail' (a pass/fail judgment call), 'text' (a short written observation), 'number' (a measured reading, e.g. pressure or temperature), or 'photo' (a required photo of something specific).",
      "Prefer 'check' and 'pass_fail' for most items. Use 'number' only for a real measurement. Use 'photo' sparingly, only when a picture is genuinely useful documentation.",
      "Mark an item required only when skipping it would be a real problem — most items should not be required.",
      "Keep labels short (a few words, no trailing period). 'help' is one short sentence of guidance, or null when the label is self-explanatory.",
      // Safety rules, no exceptions (a technician on-site is still not
      // automatically licensed for every trade a piece of equipment touches).
      "Never write an item that instructs the technician to open an electrical panel or enclosure, touch live electrical components, work on gas or refrigerant lines, or bypass or reset a safety device (a limit switch, pressure relief valve, gas shutoff, interlock, etc.) — those are licensed-trade tasks, not checklist steps.",
      "Never write an item that has the technician approach, investigate, or attempt to fix a hazard symptom (a gas smell, a burning smell, smoke, sparking, water pooling near anything electrical, a steam leak, or a refrigerant leak). If that's relevant to this equipment type, the item should instead ask them to confirm the area is clear and stop, keep clear, and call the service company (and emergency services for gas/fire) — not to diagnose or touch the hazard.",
    ].join(" "),
    tools: [
      {
        name: "propose_checklist",
        description: "Propose an inspection checklist as a flat list of items.",
        input_schema: {
          type: "object",
          properties: {
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  label: { type: "string" },
                  kind: { type: "string", enum: CHECKLIST_ITEM_KIND_VALUES },
                  required: { type: "boolean" },
                  help: { type: ["string", "null"] },
                },
                required: ["label", "kind", "required", "help"],
              },
            },
          },
          required: ["items"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "propose_checklist" },
    messages: [
      {
        role: "user",
        content: [
          `Equipment type: ${equipmentTypeName}`,
          equipmentTypeDescription ? `Description: ${equipmentTypeDescription}` : null,
          purpose ? `Purpose of this checklist: ${purpose}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
  });

  const toolUse = message.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("The model didn't return a checklist");
  }

  const rawItems = (toolUse.input as { items: DraftChecklistItem[] }).items ?? [];
  if (rawItems.length === 0) {
    throw new Error("The model returned an empty checklist");
  }

  const validKinds = new Set<string>(CHECKLIST_ITEM_KIND_VALUES);

  return rawItems.slice(0, 15).map((item) => ({
    label: (item.label || "").trim() || "Untitled item",
    kind: (validKinds.has(item.kind) ? item.kind : "check") as ChecklistItemKind,
    required: !!item.required,
    help: item.help?.trim() || null,
  }));
}
