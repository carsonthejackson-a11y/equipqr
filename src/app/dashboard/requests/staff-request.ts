import { z } from "zod";
import { MAX_DESCRIPTION_LENGTH } from "@/lib/public-request";
import { isValidIsoDate } from "@/lib/schedule";
import { normalizeShortCode } from "@/lib/short-code";
import type { RequestPriority } from "@/lib/types";

// Pure validation + search-parsing for the office "New request" /
// "New work order" sheet (Q-28, C1-26) — staff logging a job that came in by
// phone or email. Shared between the client sheet (new-request-sheet.tsx)
// and the server action (createStaffRequest in actions.ts) so both sides
// reject the same bad input with the same message, the same way
// src/lib/public-request.ts's schema is shared by the public form and its
// route handler. Nothing here touches the network or a Supabase client, so
// it's covered by plain Vitest tests.

// Unlike the public report form (serviceRequestSchema in public-request.ts,
// which deliberately withholds "urgent" from customers), staff triaging a
// phone call can and should be able to mark something urgent immediately.
export const STAFF_REQUEST_PRIORITIES = [
  "low",
  "normal",
  "high",
  "urgent",
] as const satisfies readonly RequestPriority[];

export const staffRequestSchema = z
  .object({
    equipmentId: z.string().trim().min(1, "Pick a unit"),
    description: z.string().trim().min(1, "Describe the problem").max(MAX_DESCRIPTION_LENGTH),
    contactName: z.string().trim().min(1, "Enter a contact name").max(120),
    contactEmail: z
      .string()
      .trim()
      .max(200)
      .refine((v) => v === "" || z.string().email().safeParse(v).success, "Enter a valid email address")
      .optional()
      .default(""),
    contactPhone: z.string().trim().max(40).optional().default(""),
    priority: z.enum(STAFF_REQUEST_PRIORITIES).optional().default("normal"),
    /** "YYYY-MM-DD", company-local — paired with scheduleTime via zonedWallTimeToUtcIso() in the action. Empty = no visit scheduled yet. */
    scheduleDate: z
      .string()
      .trim()
      .max(10)
      // Shape AND validity, not just length: zonedWallTimeToUtcIso() does no
      // parsing of its own, so "9/20/2026" or "2026-13-45" would reach it and
      // throw RangeError out of the action instead of coming back as { error }.
      .refine((v) => v === "" || isValidIsoDate(v), "Enter the visit date as YYYY-MM-DD")
      .optional()
      .default(""),
    /** "HH:MM", 24-hour, company-local. */
    scheduleTime: z
      .string()
      .trim()
      .max(5)
      .refine((v) => v === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(v), "Enter the visit time as HH:MM (24-hour)")
      .optional()
      .default(""),
    sendStatusEmail: z.boolean().optional().default(false),
  })
  .refine((v) => !!(v.contactEmail || v.contactPhone), {
    message: "Add a phone number or an email so you can reach them back",
    path: ["contactPhone"],
  })
  .refine((v) => !v.sendStatusEmail || !!v.contactEmail, {
    message: "Add an email address to send a status link, or turn that off",
    path: ["sendStatusEmail"],
  })
  .refine((v) => !v.scheduleTime || !!v.scheduleDate, {
    message: "Pick a date for the visit",
    path: ["scheduleDate"],
  });

export type StaffRequestInput = z.infer<typeof staffRequestSchema>;

/** First readable error message from a failed parse — same convention as public-request.ts's firstIssueMessage(). */
export function firstStaffRequestIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the form and try again";
}

// ----------------------------------------------------------------------------
// Unit search ("by name, serial or code")
// ----------------------------------------------------------------------------

export type StaffRequestEquipmentQuery = {
  /** The trimmed term as typed — always used for a name/serial ILIKE match. Empty when the box is empty. */
  term: string;
  /**
   * Set only when `term` normalises to a full 8-character short code
   * (Q-31's rule: equipment search should match sticker short codes, not
   * just name/serial). The caller ORs this in as an exact `qr_codes.short_code`
   * match alongside the ILIKE search, so typing a code ("ABCD-2345" or
   * "abcd2345") finds the unit even when its name/serial share no
   * substring with what was typed.
   */
  shortCode: string | null;
};

/** Parses a typed search term for the New-request unit picker into what the equipment-search action needs. Pure — no network. */
export function parseStaffRequestEquipmentQuery(term: string): StaffRequestEquipmentQuery {
  const trimmed = term.trim();
  return { term: trimmed, shortCode: trimmed.length > 0 ? normalizeShortCode(trimmed) : null };
}
