import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppProvider } from "@/lib/store";
import { AppShell } from "@/components/app-shell";
import { ServiceWorkerRegistrar } from "@/components/service-worker-registrar";
import { PALETTE } from "@/lib/palette";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: PALETTE.background,
};

export const metadata: Metadata = {
  title: {
    default: "AeroQuest · Flight Tracking & Route Explorer",
    template: "%s · AeroQuest",
  },
  description:
    "AeroQuest is a travel companion for direct-route discovery, live flight tracking, terminal wayfinding, 3D cabin seat twins, boarding-pass import, and offline in-flight awareness.",
  applicationName: "AeroQuest",
  keywords: [
    "flight tracker",
    "direct flights",
    "route explorer",
    "airport terminal map",
    "3d cabin seat map",
    "aviation weather",
    "boarding pass scanner",
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
