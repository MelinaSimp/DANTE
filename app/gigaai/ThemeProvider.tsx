"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

type Theme = "dark";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  colors: {
    bg: string;
    bgSecondary: string;
    bgTertiary: string;
    text: string;
    textSecondary: string;
    textTertiary: string;
    border: string;
    borderSecondary: string;
    icon: string;
    iconSecondary: string;
    iconActive: string;
    buttonPrimary: string;
    buttonPrimaryHover: string;
    buttonSecondary: string;
    inputBg: string;
    cardBg: string;
    selected: string;
    hover: string;
  };
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const themeColors = {
  "dark": {
    bg: "bg-black",
    bgSecondary: "bg-black",
    bgTertiary: "bg-black",
    text: "text-white",
    textSecondary: "text-white/90",
    textTertiary: "text-white/70",
    border: "border-white/10",
    borderSecondary: "border-white/5",
    icon: "text-white",
    iconSecondary: "text-white/70",
    iconActive: "text-cyan-400",
    buttonPrimary: "bg-cyan-500",
    buttonPrimaryHover: "hover:bg-cyan-600",
    buttonSecondary: "bg-black",
    inputBg: "bg-black",
    cardBg: "bg-black",
    selected: "bg-black text-white border-white/20",
    hover: "hover:bg-black",
  },
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    // Load theme from localStorage
    const savedTheme = localStorage.getItem("drift-theme") as Theme;
    if (savedTheme && savedTheme === "dark") {
      setThemeState(savedTheme);
    }
  }, []);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem("drift-theme", newTheme);
  };

  const colors = themeColors[theme];

  return (
    <ThemeContext.Provider value={{ theme, setTheme, colors }}>
      <div className={colors.bg + " " + colors.text + " min-h-screen"} style={{ background: '#000000', backgroundImage: 'none' }}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
