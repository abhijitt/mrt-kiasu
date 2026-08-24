import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "MRT Kiasu — stand at the right door";

/**
 * Link preview card.
 *
 * Links get shared on WhatsApp and Telegram far more than anywhere else here,
 * and without this they render as a bare URL. Drawn with plain divs because
 * the OG renderer supports no external assets and only a subset of CSS.
 */
export default function OpengraphImage() {
  const lines = ["#d42e12", "#009645", "#9016b2", "#fa9e0d", "#005ec4", "#9d5b25", "#718573"];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#12121d",
          color: "#f0ede2",
          fontFamily: "monospace",
        }}
      >
        <div style={{ display: "flex", height: 16 }}>
          {lines.map((c) => (
            <div key={c} style={{ flex: 1, background: c }} />
          ))}
        </div>

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "0 80px",
          }}
        >
          <div style={{ display: "flex", fontSize: 84, fontWeight: 700, letterSpacing: -2 }}>
            <span>MRT</span>
            <span style={{ color: "#ff5a3c" }}>Kiasu</span>
          </div>
          <div style={{ display: "flex", fontSize: 40, marginTop: 24, color: "#a8a4b8" }}>
            Stand at the right door.
          </div>
          <div style={{ display: "flex", fontSize: 28, marginTop: 40, color: "#6e6a80" }}>
            213 stations · 9 lines · Singapore MRT &amp; LRT
          </div>
        </div>
      </div>
    ),
    size,
  );
}
