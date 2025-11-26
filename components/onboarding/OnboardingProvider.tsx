// components/onboarding/OnboardingProvider.tsx
"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
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
    // Only run on client side
    if (typeof window === 'undefined') return;
    
    // Onboarding modal disabled - never show automatically
    // Check if user has completed onboarding
    // try {
    //   const hasCompletedOnboarding = localStorage.getItem("onboarding-completed");
    //   const isFirstVisit = !localStorage.getItem("has-visited");
    //   
    //   if (isFirstVisit && !hasCompletedOnboarding) {
    //     setIsOnboardingVisible(true);
    //     localStorage.setItem("has-visited", "true");
    //   }
    // } catch (error) {
    //   console.error('Error accessing localStorage:', error);
    // }
  }, []);

  const showOnboarding = () => {
    setIsOnboardingVisible(true);
  };

  const hideOnboarding = () => {
    setIsOnboardingVisible(false);
  };

  const handleComplete = () => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem("onboarding-completed", "true");
      }
    } catch (error) {
      console.error('Error saving to localStorage:', error);
    }
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
