import type { MetadataRoute } from "next";
import { PALETTE } from "@/lib/palette";

/** Installs Avi as a home-screen web app (required for iOS web push). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Avi · Flight Tracking & Route Explorer",
    short_name: "Avi",
    description:
      "Direct-route discovery, live flight tracking, airport boards, terminal wayfinding, 3D cabin seat twins, and flight alerts.",
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
