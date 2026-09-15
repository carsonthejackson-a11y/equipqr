import { ImageResponse } from "next/og";
import { MarkSvg } from "@/components/logo";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// Nocturne tokens in hex: Satori has no CSS variables or oklch.
const GROUND = "#161826";
const ACCENT = "#3ecf8e";

// At 32px the spec's 9-unit strokes come out under 3px and the finder pattern
// smudges, so the favicon runs the strokes ~22% heavier (11 / 8.6). The
// geometry is otherwise the brand mark verbatim (see src/components/logo.tsx).
const STROKE_SCALE = 11 / 9;

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: GROUND,
          borderRadius: 7,
        }}
      >
        <MarkSvg size={32} color={ACCENT} strokeScale={STROKE_SCALE} />
      </div>
    ),
    { ...size }
  );
}
