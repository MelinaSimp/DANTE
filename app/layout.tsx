// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";
import PushNotificationManager from "@/components/PushNotificationManager";
import OfflineIndicator from "@/components/OfflineIndicator";
import { OnboardingProvider } from "@/components/onboarding/OnboardingProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import ClientWrapper from "@/components/ClientWrapper";

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
      <body className="bg-[#242423] min-h-screen antialiased text-white">
        <div className="hidden">
          <Header />
        </div>
        <ErrorBoundary>
          <ClientWrapper>
            <OnboardingProvider>
              <OfflineIndicator />
              <main className="relative z-0 bg-[#242423]" style={{ background: '#242423', backgroundImage: 'none' }}>{children}</main>
              <PushNotificationManager />
            </OnboardingProvider>
          </ClientWrapper>
        </ErrorBoundary>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  try {
                    navigator.serviceWorker.register('/sw.js')
                      .then(function(registration) {
                        console.log('SW registered: ', registration);
                      })
                      .catch(function(registrationError) {
                        console.log('SW registration failed: ', registrationError);
                      });
                  } catch (error) {
                    console.error('Service worker registration error: ', error);
                  }
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
