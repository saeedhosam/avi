import type { MetadataRoute } from "next";

const HUBS = ["CAI", "DXB", "LHR", "JFK", "IST", "DOH", "FRA", "CDG", "JED", "SIN", "HND", "SFO"];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://avi.codestep.org").replace(/\/+$/, "");
  const now = new Date();
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${base}/search`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/pricing`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/routes`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    ...HUBS.map((iata) => ({
      url: `${base}/explore/${iata}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.75,
    })),
  ];
}
