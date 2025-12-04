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
    bg: "bg-[#ffffff]",
    bgSecondary: "bg-[#ffffff]",
    bgTertiary: "bg-[#f3f4f6]",
    text: "text-[#151515]",
    textSecondary: "text-[#151515]/90",
    textTertiary: "text-[#151515]/70",
    border: "border-[#e5e7eb]",
    borderSecondary: "border-[#e5e7eb]",
    icon: "text-[#151515]",
    iconSecondary: "text-[#151515]/70",
    iconActive: "text-[#3166bf]",
    buttonPrimary: "bg-[#3166bf]",
    buttonPrimaryHover: "hover:bg-[#2a5aa8]",
    buttonSecondary: "bg-[#f3f4f6]",
    inputBg: "bg-[#ffffff]",
    cardBg: "bg-[#ffffff]",
    selected: "bg-[#70d4b4] text-[#151515] border-[#151515]",
    hover: "hover:bg-[#f3f4f6]",
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
      <div className={colors.bg + " " + colors.text + " min-h-screen"} style={{ background: '#ffffff', backgroundImage: 'none' }}>
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
