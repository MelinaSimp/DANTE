// Theme utility functions for consistent theming across components

export type Theme = "dark-gray" | "white";

export function getThemeClasses(theme: Theme) {
  return {
    // Backgrounds
    bgMain: theme === "white" ? "bg-gray-50" : "bg-gray-900",
    bgSidebar: theme === "white" ? "bg-white border-gray-200" : "bg-gray-800/80 border-gray-700",
    bgCard: theme === "white" ? "bg-white border-gray-200" : "bg-black/40 border-white/10",
    bgInput: theme === "white" ? "bg-white border-gray-300" : "bg-black/40 border-white/10",
    bgHover: theme === "white" ? "hover:bg-gray-100" : "hover:bg-white/5",
    bgActive: theme === "white" ? "bg-blue-50" : "bg-white/10",
    
    // Text
    textPrimary: theme === "white" ? "text-gray-900" : "text-white",
    textSecondary: theme === "white" ? "text-gray-600" : "text-white/70",
    textTertiary: theme === "white" ? "text-gray-500" : "text-white/60",
    textQuaternary: theme === "white" ? "text-gray-400" : "text-white/40",
    
    // Borders
    border: theme === "white" ? "border-gray-200" : "border-white/10",
    borderHover: theme === "white" ? "border-gray-300" : "border-white/20",
    
    // Icons
    icon: theme === "white" ? "text-gray-600" : "text-white/60",
    iconActive: theme === "white" ? "text-blue-600" : "text-white",
    iconSecondary: theme === "white" ? "text-gray-500" : "text-white/70",
    
    // Buttons
    btnPrimary: theme === "white" 
      ? "bg-blue-600 hover:bg-blue-700 text-white" 
      : "bg-[#3351ff] hover:bg-[#4a64ff] text-white",
    btnSecondary: theme === "white"
      ? "bg-gray-100 hover:bg-gray-200 text-gray-900 border border-gray-300"
      : "bg-black/40 hover:bg-black/60 text-white border border-white/10",
    
    // Selected states
    selected: theme === "white"
      ? "bg-blue-50 text-blue-700 border border-blue-300"
      : "bg-white/10 text-white border border-blue-500/30",
    
    // Menu dropdowns
    menuBg: theme === "white" ? "bg-white border-gray-200" : "bg-black/90 border-white/10",
    menuItem: theme === "white" 
      ? "text-gray-700 hover:bg-gray-100" 
      : "text-white/70 hover:bg-white/10",
  };
}

