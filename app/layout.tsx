// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";
import PushNotificationManager from "@/components/PushNotificationManager";
import OfflineIndicator from "@/components/OfflineIndicator";
import { OnboardingProvider } from "@/components/onboarding/OnboardingProvider";

export const metadata: Metadata = {
  title: "Drift - Agent Canvas",
  description: "Build and deploy AI agents with visual flows",
  manifest: "/manifest.json",
  icons: {
    icon: "/brand/logo-circle.png",
    apple: "/brand/logo-circle.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Drift",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#ffffff] min-h-screen antialiased text-[#151515]">
        <OnboardingProvider>
          <OfflineIndicator />
          <div className="hidden">
            <Header />
          </div>
          <main className="relative z-0 bg-[#ffffff]" style={{ background: '#ffffff', backgroundImage: 'none' }}>{children}</main>
          <PushNotificationManager />
        </OnboardingProvider>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js')
                    .then(function(registration) {
                      console.log('SW registered: ', registration);
                    })
                    .catch(function(registrationError) {
                      console.log('SW registration failed: ', registrationError);
                    });
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
