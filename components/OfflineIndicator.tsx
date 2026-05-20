"use client";

import { useState, useEffect } from "react";

export default function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return;

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    // Check initial status
    try {
    setIsOnline(navigator.onLine);
    } catch (error) {
      console.error('Error checking online status:', error);
      setIsOnline(true); // Default to online
    }

    // Listen for changes
    try {
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    } catch (error) {
      console.error('Error adding event listeners:', error);
    }

    return () => {
      try {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      } catch (error) {
        console.error('Error removing event listeners:', error);
      }
    };
  }, []);

  if (isOnline) return null;

  return (
    <div className="offline-indicator show">
      <div className="flex items-center justify-center gap-2">
        <div className="w-2 h-2 bg-[var(--canvas)] rounded-full animate-pulse"></div>
        <span>You're offline. Some features may not work.</span>
      </div>
    </div>
  );
}
