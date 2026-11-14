import type { MetadataRoute } from "next";
import { PALETTE } from "@/lib/palette";

/** Installs AeroQuest as a home-screen web app (required for iOS web push). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AeroQuest · Flight Tracking & Route Explorer",
    short_name: "AeroQuest",
    description:
      "Direct-route discovery, live flight tracking, terminal wayfinding, 3D cabin seat twins, and offline in-flight awareness.",
    id: "/",
    start_url: "/",
    display: "standalone",
    background_color: PALETTE.background,
    theme_color: PALETTE.background,
    categories: ["travel", "navigation"],
    icons: [
      { src: "/icon.jpg", sizes: "512x512", type: "image/jpeg", purpose: "any" },
    ],
  };
}
