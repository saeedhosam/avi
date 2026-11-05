import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppProvider } from "@/lib/store";
import { AppShell } from "@/components/app-shell";

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

const THEME_SCRIPT = `(function(){try{var raw=localStorage.getItem('skytrack.desktop.v1');var p=raw?JSON.parse(raw):{};var mode=p.themeMode||'SYSTEM';var dark=mode==='DARK'||(mode==='SYSTEM'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=dark?'dark':'light';document.documentElement.style.colorScheme=dark?'dark':'light';}catch(e){document.documentElement.dataset.theme='dark';}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full bg-bg text-ink">
        <Suspense
          fallback={
            <div className="app-bg min-h-screen">
              <div className="hidden h-screen w-[240px] border-r border-line/70 bg-surface/80 lg:block" />
            </div>
          }
        >
          <AppProvider>
            <AppShell>{children}</AppShell>
          </AppProvider>
        </Suspense>
      </body>
    </html>
  );
}
