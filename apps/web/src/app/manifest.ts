import type { MetadataRoute } from "next";
import { PALETTE } from "@/lib/palette";

/** Installs Avi as a home-screen web app (required for iOS web push). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Avi · Live Flight Tracking",
    short_name: "Avi",
    description:
      "Live flight tracking, airport boards, route network, terminal wayfinding, and flight alerts.",
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
