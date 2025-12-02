// components/onboarding/OnboardingProvider.tsx
"use client";

import { createContext, useContext, useState, useEffect } from "react";
import OnboardingModal from "./OnboardingModal";

interface OnboardingContextType {
  showOnboarding: () => void;
  hideOnboarding: () => void;
  isOnboardingVisible: boolean;
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [isOnboardingVisible, setIsOnboardingVisible] = useState(false);

  useEffect(() => {
    // Onboarding modal disabled - never show automatically
    // Check if user has completed onboarding
    // const hasCompletedOnboarding = localStorage.getItem("onboarding-completed");
    // const isFirstVisit = !localStorage.getItem("has-visited");
    
    // if (isFirstVisit && !hasCompletedOnboarding) {
    //   setIsOnboardingVisible(true);
    //   localStorage.setItem("has-visited", "true");
    // }
  }, []);

  const showOnboarding = () => {
    setIsOnboardingVisible(true);
  };

  const hideOnboarding = () => {
    setIsOnboardingVisible(false);
  };

  const handleComplete = () => {
    localStorage.setItem("onboarding-completed", "true");
    setIsOnboardingVisible(false);
  };

  return (
    <OnboardingContext.Provider value={{ showOnboarding, hideOnboarding, isOnboardingVisible }}>
      {children}
      <OnboardingModal
        isOpen={isOnboardingVisible}
        onClose={hideOnboarding}
        onComplete={handleComplete}
      />
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (context === undefined) {
    throw new Error("useOnboarding must be used within an OnboardingProvider");
  }
  return context;
}
