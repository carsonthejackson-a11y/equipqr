import { ImageResponse } from "next/og";

export const alt = "EquipQR — QR troubleshooting & service requests for field service teams";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Satori (the ImageResponse renderer) doesn't understand oklch, so this
// mirrors the app's teal brand token in hex rather than importing globals.css.
const TEAL_900 = "#042f2e";
const TEAL_700 = "#0f766e";
const TEAL_400 = "#2dd4bf";
const TEAL_50 = "#f0fdfa";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: `linear-gradient(135deg, ${TEAL_900} 0%, ${TEAL_700} 100%)`,
          color: TEAL_50,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              display: "flex",
              width: 84,
              height: 84,
              borderRadius: 20,
              background: TEAL_50,
              color: TEAL_700,
              alignItems: "center",
              justifyContent: "center",
              fontSize: 44,
              fontWeight: 700,
            }}
          >
            Q
          </div>
          <div style={{ display: "flex", fontSize: 44, fontWeight: 700, color: TEAL_50 }}>
            EquipQR
          </div>
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 56,
            fontSize: 60,
            fontWeight: 700,
            lineHeight: 1.15,
            maxWidth: 920,
            color: TEAL_50,
          }}
        >
          Stop the truck roll before it starts.
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 28,
            lineHeight: 1.4,
            maxWidth: 820,
            color: TEAL_400,
          }}
        >
          QR troubleshooting guides & service requests for field-service teams.
        </div>
      </div>
    ),
    { ...size }
  );
}
