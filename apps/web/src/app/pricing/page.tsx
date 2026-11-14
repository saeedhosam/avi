import type { Metadata } from "next";
import { PricingContent } from "@/components/pricing-content";

export const metadata: Metadata = {
  title: "Plans & the $4.99 Single-Trip Pass",
  description:
    "Compare AeroQuest Free, AeroQuest Pro, and the one-time $4.99 Single-Trip Pass. The direct-route explorer and cabin previews stay free; paid plans add live tracking, alerts, Sprint Mode, and the offline in-flight HUD.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "AeroQuest plans & the $4.99 Single-Trip Pass",
    description:
      "Free route exploration, Pro live travel tools, or a one-time Single-Trip Pass for one trip.",
    type: "website",
    url: "/pricing",
  },
  twitter: {
    card: "summary_large_image",
    title: "AeroQuest plans & the $4.99 Single-Trip Pass",
    description:
      "Free route exploration, Pro live travel tools, or a one-time Single-Trip Pass for one trip.",
  },
};

export default function PricingPage() {
  return (
    <div className="app-bg min-h-screen">
      <main className="mx-auto w-full max-w-[1200px] px-4 py-8 lg:px-8">
        <PricingContent />
      </main>
    </div>
  );
}
