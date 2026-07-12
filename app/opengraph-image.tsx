// app/opengraph-image.tsx
//
// Dynamic OG card rendered at build time. 1200x630, graphite canvas
// with the Dante mark and all-in-one agentic platform tagline.

import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Dante — All-in-one agentic platform";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#1e1e24",
          fontFamily: "Georgia, 'Times New Roman', serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background:
              "radial-gradient(ellipse 80% 60% at 50% 40%, rgba(255,255,255,0.06) 0%, transparent 70%)",
            display: "flex",
          }}
        />

        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            background: "#e6e8ed",
            display: "flex",
          }}
        />

        <span
          style={{
            fontSize: 72,
            fontWeight: 700,
            color: "#ffffff",
            letterSpacing: -2,
            lineHeight: 1.05,
          }}
        >
          Dante
        </span>

        <span
          style={{
            fontSize: 28,
            color: "rgba(255,255,255,0.62)",
            marginTop: 18,
            letterSpacing: 1,
          }}
        >
          All-in-one agentic platform
        </span>

        <div
          style={{
            display: "flex",
            gap: 28,
            marginTop: 44,
            fontSize: 18,
            color: "rgba(255,255,255,0.55)",
            letterSpacing: 2,
            textTransform: "uppercase" as const,
          }}
        >
          <span>Agents</span>
          <span>·</span>
          <span>Sites</span>
          <span>·</span>
          <span>Workflows</span>
        </div>

        <span
          style={{
            position: "absolute",
            bottom: 36,
            fontSize: 16,
            color: "rgba(255,255,255,0.35)",
            letterSpacing: 2,
          }}
        >
          Almost hallucination-free · citation-grounded
        </span>
      </div>
    ),
    { ...size }
  );
}
