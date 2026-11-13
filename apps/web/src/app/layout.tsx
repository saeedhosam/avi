import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppProvider } from "@/lib/store";
import { AppShell } from "@/components/app-shell";
import { ServiceWorkerRegistrar } from "@/components/service-worker-registrar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Avi · Live Flight Tracking & Radar",
    template: "%s · Avi",
  },
  description:
    "Avi is a live flight tracking assistant with interactive radar, global route maps, airport boards, gate navigation, destination weather, and offline watchlists.",
  applicationName: "Avi",
  keywords: [
    "flight tracker",
    "live flight map",
    "airport board",
    "flight connections",
    "terminal map",
    "aviation weather",
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-bg text-ink">
        <Suspense
          fallback={
            <div className="app-bg min-h-screen">
              <div className="hidden h-screen w-[240px] border-r border-line/70 bg-surface/80 lg:block" />
            </div>
          }
        >
          <AppProvider>
            <ServiceWorkerRegistrar />
            <AppShell>{children}</AppShell>
          </AppProvider>
        </Suspense>
      </body>
    </html>
  );
}
