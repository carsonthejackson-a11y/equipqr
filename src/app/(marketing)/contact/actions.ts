"use server";

import { headers } from "next/headers";
import { Resend } from "resend";
import { sanitizeEmailSubject } from "@/lib/email/layout";
import { checkRateLimit, getClientIpFromHeaders, type RateLimitRule } from "@/lib/rate-limit";
import { SUPPORT_EMAIL } from "@/lib/site";
import { validateContactForm, type ContactState } from "./validation";

// `ContactState` / `initialContactState` live in validation.ts: a "use server"
// module may only export async functions, and this file is imported by the
// client form.

/**
 * Anonymous write surface (relays free text to the support inbox with a
 * visitor-controlled Reply-To), so it gets a per-IP limit like every other
 * public form. Local to this file rather than RATE_LIMITS — the marketing
 * site owns it.
 */
const CONTACT_PER_IP: RateLimitRule = { limit: 5, windowSeconds: 60 * 60 };

export async function submitContactForm(
  _prevState: ContactState,
  formData: FormData
): Promise<ContactState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const company = String(formData.get("company") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  // Same check as the client pre-check (validation.ts); this one is authoritative.
  const invalid = validateContactForm({ name, email, company, message });
  if (invalid) {
    return { status: "error", message: invalid };
  }

  const withinLimit = await checkRateLimit(
    `contact:ip:${getClientIpFromHeaders(await headers())}`,
    CONTACT_PER_IP
  );
  if (!withinLimit) {
    return {
      status: "error",
      message: `Too many messages from this connection — please wait a while, or email us directly at ${SUPPORT_EMAIL}.`,
    };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !fromEmail) {
    console.warn("RESEND_API_KEY or RESEND_FROM_EMAIL not configured — skipping contact email");
    return {
      status: "error",
      message: `Email isn't set up yet on this environment — reach us directly at ${SUPPORT_EMAIL}.`,
    };
  }

  const resend = new Resend(apiKey);

  try {
    // Resend's SDK resolves with an { data, error } tuple for API-level
    // failures (bad domain, rate limit, invalid recipient) instead of
    // throwing — only transport/unexpected errors reach the catch below.
    // Same check as src/lib/email/send.ts; without it a 4xx from Resend was
    // reported to the visitor as "Thanks, we'll get back to you".
    const { error } = await resend.emails.send({
      from: fromEmail,
      to: SUPPORT_EMAIL,
      replyTo: email,
      // `name`/`company` are visitor-typed: strip CR/LF so they can't start a
      // second header line (layout.ts: every subject goes through this).
      subject: sanitizeEmailSubject(`Contact form: ${name}${company ? ` (${company})` : ""}`),
      text: [
        `Name: ${name}`,
        `Email: ${email}`,
        company ? `Company: ${company}` : null,
        "",
        message,
      ]
        .filter((line): line is string => line !== null)
        .join("\n"),
    });

    if (error) {
      console.error("Failed to send contact email", error);
      return {
        status: "error",
        message: `Something went wrong sending your message — email us directly at ${SUPPORT_EMAIL}.`,
      };
    }
  } catch (error) {
    console.error("Failed to send contact email", error);
    return {
      status: "error",
      message: `Something went wrong sending your message — email us directly at ${SUPPORT_EMAIL}.`,
    };
  }

  // BRIEF §3.5: the design's H2 (comma) is rendered from this string.
  return { status: "success", message: "Thanks, we'll get back to you shortly." };
}
