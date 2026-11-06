import type { MetadataRoute } from "next";

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
    background_color: "#071018",
    theme_color: "#071018",
    categories: ["travel", "navigation"],
    icons: [
      { src: "/icon.jpg", sizes: "512x512", type: "image/jpeg", purpose: "any" },
    ],
  };
}
