import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-ui-loaded)", "Inter", "system-ui", "sans-serif"],
        serif: ["var(--font-display-loaded)", "EB Garamond", "Georgia", "serif"],
        mono: ["var(--font-mono-loaded)", "JetBrains Mono", "monospace"],
      },
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
          DEFAULT: "hsl(var(--accent-shadcn))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        blue: {
          DEFAULT: "rgb(0, 136, 255)",
          50: "rgba(0, 136, 255, 0.05)",
          100: "rgba(0, 136, 255, 0.1)",
          200: "rgba(0, 136, 255, 0.3)",
          600: "rgb(0, 136, 255)",
          700: "rgb(0, 120, 230)",
        },
        brand: {
          white: "#ffffff",
          dark: "#111827",
          blue: {
            primary: "rgb(0, 136, 255)",
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
        xl: "calc(var(--radius) + 4px)",
      },
      boxShadow: {
        soft: "0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.06)",
        ground:
          "0 1px 2px rgba(0,0,0,0.04), 0 4px 10px -2px rgba(0,0,0,0.05)",
        raised:
          "0 2px 4px rgba(0,0,0,0.05), 0 12px 24px -6px rgba(0,0,0,0.10)",
        floating:
          "0 8px 16px -4px rgba(0,0,0,0.10), 0 24px 48px -12px rgba(0,0,0,0.18)",
        glass:
          "var(--shadow-glass)",
        "glass-card":
          "var(--shadow-card)",
        "glass-card-hover":
          "var(--shadow-card-hover)",
        rail:
          "var(--shadow-rail)",
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
        "sidebar-fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "ring-expand-1mi": {
          "0%": { opacity: "0", transform: "scale(0)" },
          "50%": { opacity: "0.7", transform: "scale(0.6)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "ring-expand-3mi": {
          "0%": { opacity: "0", transform: "scale(0)" },
          "40%": { opacity: "0", transform: "scale(0)" },
          "70%": { opacity: "0.5", transform: "scale(0.6)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "pulse-slow": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.6", transform: "scale(1.3)" },
        },
      },
      animation: {
        "fade-up": "fade-up 240ms cubic-bezier(0.22, 1, 0.36, 1) both",
        "fade-in": "fade-in 200ms ease-out both",
        "glow-pulse": "glow-pulse 1.6s ease-in-out infinite",
        shimmer: "shimmer 2.4s linear infinite",
        "ring-expand-1mi": "ring-expand-1mi 1.2s cubic-bezier(0.22, 1, 0.36, 1) both",
        "ring-expand-3mi": "ring-expand-3mi 1.8s cubic-bezier(0.22, 1, 0.36, 1) both",
        "pulse-slow": "pulse-slow 2.5s ease-in-out infinite",
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
