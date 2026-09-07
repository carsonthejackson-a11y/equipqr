import { describe, expect, it } from "vitest";
import { buildIcsEvent } from "@/lib/ics";

function parseLines(ics: string): string[] {
  // Undo RFC 5545 line folding (continuation lines start with a space) so
  // assertions can match a logical line regardless of where it wrapped.
  return ics
    .split("\r\n")
    .filter((l) => l.length > 0)
    .reduce<string[]>((acc, line) => {
      if (line.startsWith(" ") && acc.length > 0) {
        acc[acc.length - 1] += line.slice(1);
      } else {
        acc.push(line);
      }
      return acc;
    }, []);
}

describe("buildIcsEvent", () => {
  it("produces a well-formed VCALENDAR/VEVENT pair", () => {
    const ics = buildIcsEvent({
      uid: "req-123@equipqr.app",
      title: "Visit: Break room water heater",
      startIso: "2026-09-10T15:00:00.000Z",
      durationMinutes: 60,
    });

    const lines = parseLines(ics);
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines).toContain("VERSION:2.0");
    expect(lines).toContain("BEGIN:VEVENT");
    expect(lines).toContain("UID:req-123@equipqr.app");
    expect(lines).toContain("DTSTART:20260910T150000Z");
    expect(lines).toContain("DTEND:20260910T160000Z");
    expect(lines).toContain("SUMMARY:Visit: Break room water heater");
    expect(lines).toContain("END:VEVENT");
    expect(lines[lines.length - 1]).toBe("END:VCALENDAR");
  });

  it("computes DTEND from startIso + durationMinutes", () => {
    const ics = buildIcsEvent({
      uid: "u1",
      title: "t",
      startIso: "2026-01-01T00:00:00.000Z",
      durationMinutes: 90,
    });
    expect(parseLines(ics)).toContain("DTEND:20260101T013000Z");
  });

  it("includes optional fields only when provided", () => {
    const withOptional = buildIcsEvent({
      uid: "u2",
      title: "t",
      startIso: "2026-01-01T00:00:00.000Z",
      durationMinutes: 30,
      description: "Some notes",
      location: "123 Main St",
      url: "https://example.com/r/abc",
    });
    const lines = parseLines(withOptional);
    expect(lines).toContain("DESCRIPTION:Some notes");
    expect(lines).toContain("LOCATION:123 Main St");
    expect(lines).toContain("URL:https://example.com/r/abc");

    const withoutOptional = buildIcsEvent({
      uid: "u3",
      title: "t",
      startIso: "2026-01-01T00:00:00.000Z",
      durationMinutes: 30,
    });
    expect(withoutOptional).not.toContain("DESCRIPTION:");
    expect(withoutOptional).not.toContain("LOCATION:");
    expect(withoutOptional).not.toContain("URL:");
  });

  it("escapes commas, semicolons, backslashes and newlines per RFC 5545", () => {
    const ics = buildIcsEvent({
      uid: "u4",
      title: "Repair, urgent; check\\valve\nline two",
      startIso: "2026-01-01T00:00:00.000Z",
      durationMinutes: 30,
    });
    const lines = parseLines(ics);
    const summary = lines.find((l) => l.startsWith("SUMMARY:"));
    expect(summary).toBe("SUMMARY:Repair\\, urgent\\; check\\\\valve\\nline two");
  });

  it("cannot be broken out of with a bare CR or a control character", () => {
    const ics = buildIcsEvent({
      uid: "u4b",
      title: "Repair",
      // A bare CR is a line break to lenient iCalendar parsers, so text that
      // carries one must not be able to start a property of its own.
      description: "before\rSUMMARY:injected\r\nX-EVIL:1\u0000\u007f",
      startIso: "2026-01-01T00:00:00.000Z",
      durationMinutes: 30,
    });
    expect(ics).not.toContain("\rSUMMARY:injected");
    expect(ics).not.toContain("\r\nX-EVIL:1");
    expect(ics).not.toContain("\u0000");
    const lines = parseLines(ics);
    expect(lines.find((l) => l.startsWith("DESCRIPTION:"))).toBe(
      "DESCRIPTION:before\\nSUMMARY:injected\\nX-EVIL:1"
    );
    expect(lines.filter((l) => l.startsWith("SUMMARY:"))).toHaveLength(1);
  });

  it("folds long lines and rejoins to the same logical content", () => {
    const longTitle = "A".repeat(200);
    const ics = buildIcsEvent({
      uid: "u5",
      title: longTitle,
      startIso: "2026-01-01T00:00:00.000Z",
      durationMinutes: 30,
    });
    // The raw file has folded (short) physical lines...
    const rawLines = ics.split("\r\n").filter(Boolean);
    expect(rawLines.some((l) => l.length > 76)).toBe(false);
    // ...that unfold back to the original summary.
    const lines = parseLines(ics);
    expect(lines).toContain(`SUMMARY:${longTitle}`);
  });

  it("ends every physical line with CRLF", () => {
    const ics = buildIcsEvent({
      uid: "u6",
      title: "t",
      startIso: "2026-01-01T00:00:00.000Z",
      durationMinutes: 30,
    });
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.includes("\n") && !ics.includes("\r\n")).toBe(false);
  });
});
