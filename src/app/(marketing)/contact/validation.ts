// Validation shared by the server action (authoritative) and the client
// pre-check in contact-form.tsx — same strings on both sides (BRIEF §3.5).
// Kept out of actions.ts because a "use server" module may only export
// async functions.

export const CONTACT_REQUIRED_MESSAGE = "Please fill in your name, email, and a message.";
export const CONTACT_EMAIL_MESSAGE = "That email address doesn’t look right.";
export const CONTACT_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ContactState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export const initialContactState: ContactState = { status: "idle" };

export type ContactFormValues = { name: string; email: string; company: string; message: string };

/** Returns the design's error string, or `null` when the values pass. */
export function validateContactForm(values: ContactFormValues): string | null {
  const name = values.name.trim();
  const email = values.email.trim();
  const message = values.message.trim();
  if (!name || !email || !message) return CONTACT_REQUIRED_MESSAGE;
  if (!CONTACT_EMAIL_PATTERN.test(email)) return CONTACT_EMAIL_MESSAGE;
  return null;
}
