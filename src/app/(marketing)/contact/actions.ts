"use server";

import { Resend } from "resend";
import { SUPPORT_EMAIL } from "@/lib/site";

export type ContactState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export const initialContactState: ContactState = { status: "idle" };

export async function submitContactForm(
  _prevState: ContactState,
  formData: FormData
): Promise<ContactState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const company = String(formData.get("company") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  if (!name || !email || !message) {
    return { status: "error", message: "Please fill in your name, email, and a message." };
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
    await resend.emails.send({
      from: fromEmail,
      to: SUPPORT_EMAIL,
      replyTo: email,
      subject: `Contact form: ${name}${company ? ` (${company})` : ""}`,
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
  } catch (error) {
    console.error("Failed to send contact email", error);
    return {
      status: "error",
      message: `Something went wrong sending your message — email us directly at ${SUPPORT_EMAIL}.`,
    };
  }

  return { status: "success", message: "Thanks — we'll get back to you shortly." };
}
