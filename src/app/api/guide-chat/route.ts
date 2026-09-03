import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { classifyGuideOption } from "@/lib/anthropic";
import { getCompanyPlanFlags } from "@/lib/billing";
import { getPlan } from "@/lib/plans";
import type { ResolvedQrCode } from "@/lib/types";

const MAX_MESSAGE_LENGTH = 400;

type RequestBody = {
  qrToken?: string;
  stepId?: string;
  message?: string;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as RequestBody | null;

  if (!body?.qrToken || !body.stepId || !body.message?.trim()) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (body.message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: "Message is too long" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data } = await supabase.rpc("resolve_qr_code", { p_token: body.qrToken });
  const resolved = data as ResolvedQrCode;

  if (!resolved || resolved.status !== "claimed") {
    return NextResponse.json({ error: "Unknown equipment" }, { status: 404 });
  }

  const step = resolved.guide.steps.find((s) => s.id === body.stepId);
  if (!step) {
    return NextResponse.json({ error: "Unknown step" }, { status: 400 });
  }

  // Defense in depth: the UI already hides the chat input when the plan
  // doesn't include aiChat, but the endpoint enforces it too. Fails open
  // (allows the call) if plan flags can't be determined — billing hiccups
  // shouldn't take down the public guide.
  const planFlags = await getCompanyPlanFlags(resolved.guide.company.id);
  if (planFlags && !getPlan(planFlags.plan_id).features.aiChat) {
    return NextResponse.json({ error: "AI chat is not available on this plan" }, { status: 403 });
  }

  const matchedOptionId = await classifyGuideOption({
    stepTitle: step.title,
    stepInstructions: step.instructions,
    options: step.options.map((o) => ({ id: o.id, label: o.label })),
    message: body.message.trim(),
  });

  return NextResponse.json({ matchedOptionId });
}
