// Text sanitising for PDF label sheets.
//
// pdf-lib's built-in fonts (Helvetica / Courier) are WinAnsi-encoded, and
// drawing a character outside that encoding THROWS rather than rendering a
// box. Equipment and company names are free-text user input, so a unit called
// "冷蔵庫 A" or "Chiller 🙂" would otherwise 500 the whole sheet. Everything
// that reaches page.drawText() goes through here first.

// The WinAnsi-only characters that live in the 0x80–0x9F range (the rest of
// WinAnsi is ASCII plus Latin-1 supplement, handled by the range check below).
const WIN_ANSI_SPECIALS = new Set(
  "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ".split("")
);

// Common look-alikes worth keeping legible rather than dropping outright.
const TRANSLITERATIONS: Record<string, string> = {
  " ": " ", // non-breaking space
  "‑": "-", // non-breaking hyphen
  "‒": "-",
  "―": "-",
  "′": "'",
  "″": '"',
  "´": "'",
  "⁄": "/",
  "−": "-",
  "×": "x",
};

function isWinAnsiEncodable(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  // Printable ASCII (skip control chars) + Latin-1 supplement.
  if (code >= 0x20 && code <= 0x7e) return true;
  if (code >= 0xa0 && code <= 0xff) return true;
  return WIN_ANSI_SPECIALS.has(char);
}

/**
 * Makes `text` safe to draw with a WinAnsi standard font: collapses
 * whitespace, transliterates a few common look-alikes, strips accents from
 * anything still unencodable, and drops what's left over. Returns `fallback`
 * when nothing printable survives, so a label never comes out blank.
 */
export function sanitizeLabelText(text: string | null | undefined, fallback = ""): string {
  if (!text) return fallback;

  const collapsed = text.replace(/\s+/g, " ").trim();
  let out = "";

  for (const char of collapsed) {
    const mapped = TRANSLITERATIONS[char] ?? char;
    if (isWinAnsiEncodable(mapped)) {
      out += mapped;
      continue;
    }
    // "ḃ" -> "b": decompose and keep the base letter when there is one.
    const stripped = mapped
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .split("")
      .filter(isWinAnsiEncodable)
      .join("");
    out += stripped;
  }

  const cleaned = out.replace(/\s+/g, " ").trim();
  return cleaned || fallback;
}
