import Anthropic from "@anthropic-ai/sdk";
import { serverEnv } from "@/lib/env";
import type { GuideGraphNode, GuideOutcome } from "./types";

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

export type DraftGuideNode = {
  temp_id: string;
  title: string;
  instructions: string;
  is_root: boolean;
  options: { label: string; outcome: GuideOutcome; next_temp_id: string | null }[];
};

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

  const rawNodes = (toolUse.input as { nodes: DraftGuideNode[] }).nodes ?? [];
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
export function normalizeDraftNodes(rawNodes: DraftGuideNode[]): GuideGraphNode[] {
  const validTempIds = new Set(rawNodes.map((n) => n.temp_id));
  const hasRoot = rawNodes.some((n) => n.is_root);

  return rawNodes.map((node, index) => ({
    tempId: node.temp_id,
    title: node.title,
    instructions: node.instructions?.trim() || null,
    // Defensive: if the model didn't mark exactly one root, fall back to the first node.
    isRoot: hasRoot ? node.is_root : index === 0,
    options: node.options.map((option) => {
      // Defensive: a "continue" option must resolve to a real node in this
      // same draft, or the DB insert will violate a check constraint later.
      const targetValid = option.next_temp_id && validTempIds.has(option.next_temp_id);
      return {
        label: option.label,
        outcome: option.outcome === "continue" && !targetValid ? "escalate" : option.outcome,
        nextTempId: option.outcome === "continue" && targetValid ? option.next_temp_id : null,
      };
    }),
  }));
}

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

    const message = await anthropic.messages.create({
      model: DRAFTING_MODEL,
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
    });

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
