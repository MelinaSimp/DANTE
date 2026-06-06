"use client";

import { useEffect } from "react";

export default function PushNotificationManager() {
  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') return;
    
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      // Request notification permission
      const requestPermission = async () => {
        try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          // push notifications enabled
          
          // Subscribe to push notifications
          try {
              const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
              if (!vapidKey) {
                // VAPID key not configured
                return;
              }
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.subscribe({
              userVisibleOnly: true,
                applicationServerKey: vapidKey
            });
            
            // Send subscription to server
            await fetch('/api/push/subscribe', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(subscription),
            });
          } catch (error) {
            console.error('Push subscription failed:', error);
          }
          }
        } catch (error) {
          console.error('Notification permission request failed:', error);
        }
      };

      requestPermission();
    }
  }, []);

  return null;
}
