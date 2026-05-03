import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        beige: "#F5F5DC",
        almond: "#EED9C4",
        bisque: "#FFE4C4",
        tuscan: "#FAD6A5",
        cosmic: "#FFF8E7",
        badge: "#A67B5B",
        // New light theme colors
        brand: {
          white: "#ffffff",
          dark: "#151515",
          blue: {
            primary: "#3166bf",
            light: "#aeb8c9",
            accent: "#afedff",
          },
          green: {
            active: "#70d4b4",
            text: "#e8f6f3",
          },
          red: "#f0494a",
          yellow: "#fbbf24",
          orange: "#f49d0d",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl2: "1rem",
      },
      boxShadow: {
        // Legacy alias — kept for back-compat. Prefer the hierarchy below.
        soft: "0 1px 2px rgba(60,40,20,0.04), 0 4px 12px rgba(60,40,20,0.06)",
        // ── Drift depth hierarchy ───────────────────────────────────
        // Four layers, warm-tinted (rgba(60,40,20) = warm umber, not
        // neutral gray). Use these consistently for a calm, considered
        // surface system. See ADR on UI motion + depth.
        recessed:
          "inset 0 1px 0 rgba(255,255,255,0.5), inset 0 -1px 0 rgba(60,40,20,0.04)",
        ground:
          "inset 0 1px 0 rgba(255,255,255,0.6), 0 1px 2px rgba(60,40,20,0.04), 0 4px 10px -2px rgba(60,40,20,0.05)",
        raised:
          "inset 0 1px 0 rgba(255,255,255,0.7), 0 2px 4px rgba(60,40,20,0.05), 0 12px 24px -6px rgba(60,40,20,0.10)",
        floating:
          "inset 0 1px 0 rgba(255,255,255,0.8), 0 8px 16px -4px rgba(60,40,20,0.10), 0 24px 48px -12px rgba(60,40,20,0.18)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "glow-pulse": {
          "0%, 100%": { opacity: "0.55", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.15)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "fade-up": "fade-up 240ms cubic-bezier(0.22, 1, 0.36, 1) both",
        "fade-in": "fade-in 200ms ease-out both",
        "glow-pulse": "glow-pulse 1.6s ease-in-out infinite",
        shimmer: "shimmer 2.4s linear infinite",
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
        "out-quart": "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
};
export default config;
