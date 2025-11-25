import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        beige: "#F5F5DC",
        almond: "#EED9C4",
        bisque: "#FFE4C4",
        tuscan: "#FAD6A5",
        cosmic: "#FFF8E7",        // new page background
        badge: "#A67B5B"          // icon badge background
      },
      boxShadow: {
        soft: "0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.06)",
      },
      borderRadius: { xl2: "1rem" },
    },
  },
  plugins: [],
};
export default config;
