// Minimal RFC 5545 (iCalendar) VEVENT builder for the "add visit to your
// calendar" download on a scheduled service request. One event per file —
// no recurrence, no attendees, no timezone components (everything is
// expressed in UTC via the "Z" suffix, which every calendar client accepts
// unambiguously regardless of the reader's own timezone).

export type IcsEventInput = {
  /** Stable, globally-unique id for this event — reusing it lets a calendar app update rather than duplicate. */
  uid: string;
  title: string;
  description?: string | null;
  location?: string | null;
  /** UTC ISO instant the visit starts. */
  startIso: string;
  durationMinutes: number;
  /** Link back to the request (dashboard or public status page). */
  url?: string | null;
};

/**
 * Escapes text per RFC 5545 §3.3.11 (backslash, semicolon, comma, newline).
 *
 * Every line break form — CRLF, a bare LF, and a bare CR — collapses to the
 * literal `\n` escape, and any other C0 control character is dropped. The
 * values folded into these lines include customer- and technician-typed text
 * (a request description, an equipment location), so a stray CR left in the
 * output would end the property line for parsers that accept bare CR as a
 * break and let that text inject its own iCalendar properties.
 */
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
}

/** "YYYYMMDDTHHMMSSZ" from a UTC ISO instant. */
function toIcsUtcStamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

/** UTF-8 size of one code point — the unit RFC 5545 folds by. */
function utf8ByteLength(codePoint: number): number {
  if (codePoint < 0x80) return 1;
  if (codePoint < 0x800) return 2;
  if (codePoint < 0x10000) return 3;
  return 4;
}

/**
 * RFC 5545 §3.1 line folding: continuation lines start with a single space,
 * and no physical line may exceed 75 OCTETS — bytes of UTF-8, not JS string
 * units. The content is customer-typed (a title with an emoji, an accented
 * street name), so this walks the line by code point and counts bytes:
 * slicing at 75 UTF-16 units used to cut a surrogate pair in half, leaving
 * two lone halves that encode as U+FFFD and corrupt the event's SUMMARY.
 */
function foldLine(line: string): string {
  const parts: string[] = [];
  let current = "";
  let currentBytes = 0;
  // The first physical line gets all 75 octets; each continuation line
  // spends one on its leading space.
  let limit = 75;
  for (const ch of line) {
    const bytes = utf8ByteLength(ch.codePointAt(0) ?? 0);
    if (currentBytes + bytes > limit) {
      parts.push(current);
      current = "";
      currentBytes = 0;
      limit = 74;
    }
    current += ch;
    currentBytes += bytes;
  }
  parts.push(current);
  return parts.map((part, i) => (i === 0 ? part : ` ${part}`)).join("\r\n");
}

/** Builds a complete `.ics` file (VCALENDAR wrapping one VEVENT) as a CRLF-terminated string. */
export function buildIcsEvent(input: IcsEventInput): string {
  const endIso = new Date(new Date(input.startIso).getTime() + input.durationMinutes * 60_000).toISOString();

  const lines: (string | null)[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//EquipQR//Visit Scheduling//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(input.uid)}`,
    `DTSTAMP:${toIcsUtcStamp(new Date().toISOString())}`,
    `DTSTART:${toIcsUtcStamp(input.startIso)}`,
    `DTEND:${toIcsUtcStamp(endIso)}`,
    `SUMMARY:${escapeIcsText(input.title)}`,
    input.description ? `DESCRIPTION:${escapeIcsText(input.description)}` : null,
    input.location ? `LOCATION:${escapeIcsText(input.location)}` : null,
    input.url ? `URL:${escapeIcsText(input.url)}` : null,
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines
    .filter((line): line is string => line !== null)
    .map(foldLine)
    .join("\r\n") + "\r\n";
}
