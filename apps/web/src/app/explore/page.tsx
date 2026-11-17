import type { Metadata } from "next";
import {
  ExploreWorld,
  type ExploreWorldAirport,
} from "@/components/explore-world";
import { routeAirports } from "@/lib/data";

export const metadata: Metadata = {
  title: "Global airport connectivity map",
  description:
    "Explore every airport with active routes on one globe, coloured by its active route count. Select an airport to open its direct-route network.",
  alternates: { canonical: "/explore" },
  openGraph: {
    title: "Avi global airport connectivity map",
    description: "A worldwide airport map coloured by active route count.",
    type: "website",
    url: "/explore",
  },
  twitter: {
    card: "summary_large_image",
    title: "Avi global airport connectivity map",
    description: "A worldwide airport map coloured by active route count.",
  },
};

export default function ExploreIndex() {
  const airports: ExploreWorldAirport[] = routeAirports
    .filter(
      (airport) =>
        !airport.historical &&
        (airport.destCount ?? 0) > 0 &&
        Number.isFinite(airport.latitude) &&
        Number.isFinite(airport.longitude),
    )
    .map(({ iata, city, latitude, longitude, destCount }) => ({
      iata,
      city,
      latitude,
      longitude,
      destCount: destCount ?? 0,
    }));

  return (
    <div className="explore-viewport w-full overflow-hidden">
      <ExploreWorld airports={airports} />
    </div>
  );
}
