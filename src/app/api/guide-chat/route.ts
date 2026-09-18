import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { classifyGuideOption } from "@/lib/anthropic";
import { getCompanyPlanFlags } from "@/lib/billing";
import { getPlan } from "@/lib/plans";
import { firstIssueMessage, guideChatSchema } from "@/lib/public-request";
import { enforceRateLimits, getClientIp, RATE_LIMITS } from "@/lib/rate-limit";
import type { ResolvedQrCode } from "@/lib/types";

export async function POST(request: Request) {
  // Every call that gets past here costs an Anthropic request, so the limit
  // is checked before anything is parsed or looked up.
  const limited = await enforceRateLimits([
    { key: `chat:ip:${getClientIp(request)}`, rule: RATE_LIMITS.guideChatPerIp },
  ]);
  if (limited) return limited;

  // zod, like the sibling public routes — the hand-rolled check this replaced
  // called `body.message?.trim()` on whatever JSON arrived, so a non-string
  // `message` threw a TypeError and this public route answered 500.
  const raw: unknown = await request.json().catch(() => null);
  const parsed = guideChatSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }
  const body = parsed.data;

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
