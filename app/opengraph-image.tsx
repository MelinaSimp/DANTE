// app/opengraph-image.tsx
//
// Dynamic OG card rendered at build time. 1200x630, dark canvas
// with the Dante logo and tagline. Replaces the square logo fallback.

import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Dante -- AI agents & workflows";
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
          backgroundColor: "#0f0f0f",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Subtle gradient accent */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background:
              "radial-gradient(ellipse 80% 60% at 50% 40%, rgba(99,102,241,0.12) 0%, transparent 70%)",
            display: "flex",
          }}
        />

        {/* Top rule */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 4,
            background: "linear-gradient(90deg, #6366f1, #8b5cf6, #6366f1)",
            display: "flex",
          }}
        />

        {/* Logo mark */}
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: 20,
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 32,
            boxShadow: "0 8px 32px rgba(99,102,241,0.3)",
          }}
        >
          <span
            style={{
              fontSize: 40,
              fontWeight: 800,
              color: "#ffffff",
              letterSpacing: -2,
            }}
          >
            D
          </span>
        </div>

        {/* Title */}
        <span
          style={{
            fontSize: 56,
            fontWeight: 700,
            color: "#ffffff",
            letterSpacing: -1,
            lineHeight: 1.1,
          }}
        >
          Dante
        </span>

        {/* Tagline */}
        <span
          style={{
            fontSize: 24,
            color: "rgba(255,255,255,0.55)",
            marginTop: 16,
            letterSpacing: 4,
            textTransform: "uppercase" as const,
          }}
        >
          AI Agents & Workflows
        </span>

        {/* Feature pills */}
        <div
          style={{
            display: "flex",
            gap: 16,
            marginTop: 40,
          }}
        >
          {["Document Intelligence", "Voice AI", "Workflows"].map(
            (label) => (
              <span
                key={label}
                style={{
                  fontSize: 16,
                  color: "rgba(255,255,255,0.7)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: 999,
                  padding: "8px 20px",
                  background: "rgba(255,255,255,0.04)",
                }}
              >
                {label}
              </span>
            )
          )}
        </div>

        {/* Domain */}
        <span
          style={{
            position: "absolute",
            bottom: 32,
            fontSize: 16,
            color: "rgba(255,255,255,0.35)",
            letterSpacing: 2,
          }}
        >
          driftai.studio
        </span>
      </div>
    ),
    { ...size }
  );
}
