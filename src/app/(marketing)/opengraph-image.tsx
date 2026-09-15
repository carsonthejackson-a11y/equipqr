import { ImageResponse } from "next/og";
import { MarkSvg } from "@/components/logo";
import { SITE_DESCRIPTION } from "@/lib/site";

export const alt = "EquipQR — Scan the tag. Fix it, or file the request.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Nocturne tokens in hex/rgba (Satori has no CSS variables, color-mix or oklch).
// Source: docs/design/marketing-2026-09/BRIEF.md D1 and README "Design tokens".
const BG = "#161826";
const TEXT = "#e9e9ed";
const NEUTRAL_400 = "#b2b6ca";
const ACCENT = "#3ecf8e";
// accent-900 (#093421) at 72% — the README page-root glow, top-right.
const GLOW = "rgba(9, 52, 33, 0.72)";

const HEADLINE_LINE_1 = "Scan the tag.";
const HEADLINE_LINE_2 = "Fix it, or file the request.";

type LoadedFont = { name: string; data: ArrayBuffer; weight: 400 | 500; style: "normal" };

/**
 * Fetches a Google Fonts face as a TTF buffer at build time. Google serves
 * TTF (not woff2) to non-browser user agents, which is what Satori needs.
 * Any failure — offline build, timeout, format change — returns null and the
 * image falls back to Satori's bundled sans, so the build never breaks.
 */
async function loadGoogleFont(family: string, weight: 400 | 500): Promise<LoadedFont | null> {
  try {
    const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}`;
    const css = await fetch(cssUrl, { signal: AbortSignal.timeout(8000) }).then((res) =>
      res.ok ? res.text() : Promise.reject(new Error(`${res.status} ${cssUrl}`))
    );
    const fontUrl = css.match(/src:\s*url\(([^)]+\.ttf)\)/)?.[1];
    if (!fontUrl) return null;
    const res = await fetch(fontUrl, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return { name: family, data: await res.arrayBuffer(), weight, style: "normal" };
  } catch {
    return null;
  }
}

export default async function Image() {
  const [dmSans, inter500, inter400] = await Promise.all([
    loadGoogleFont("DM Sans", 500),
    loadGoogleFont("Inter", 500),
    loadGoogleFont("Inter", 400),
  ]);
  const fonts = [dmSans, inter500, inter400].filter((f): f is LoadedFont => f !== null);

  // Only name a family Satori actually has; otherwise inherit the bundled fallback.
  const wordmarkFamily = dmSans ? "DM Sans" : undefined;
  const bodyFamily = inter500 || inter400 ? "Inter" : undefined;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          backgroundColor: BG,
          backgroundImage: `radial-gradient(1000px 600px at 82% -140px, ${GLOW}, transparent 60%), radial-gradient(900px 660px at -10% 100%, rgba(0, 0, 0, 0.3), transparent 55%)`,
          color: TEXT,
          fontFamily: bodyFamily,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <MarkSvg size={84} color={ACCENT} />
          <div
            style={{
              display: "flex",
              fontFamily: wordmarkFamily,
              fontSize: 50,
              fontWeight: 500,
              letterSpacing: "-0.02em",
              lineHeight: 1,
              color: TEXT,
            }}
          >
            EquipQR
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 60,
              fontWeight: 500,
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              maxWidth: 900,
              color: TEXT,
            }}
          >
            <div style={{ display: "flex" }}>{HEADLINE_LINE_1}</div>
            <div style={{ display: "flex" }}>{HEADLINE_LINE_2}</div>
          </div>

          <div
            style={{
              display: "flex",
              marginTop: 28,
              fontSize: 28,
              fontWeight: 400,
              lineHeight: 1.4,
              maxWidth: 860,
              color: NEUTRAL_400,
            }}
          >
            {SITE_DESCRIPTION}
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined }
  );
}
