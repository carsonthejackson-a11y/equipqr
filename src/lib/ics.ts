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

/** RFC 5545 §3.1 line folding: continuation lines start with a single space, wrapped at 75 octets. ASCII-only content here, so octets == characters. */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 0) {
    parts.push(" " + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  return parts.join("\r\n");
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
