import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ExploreGlobe } from "@/components/explore-globe";
import { findAirportNode, routeAirports } from "@/lib/data";
import { getExploreRoutes } from "@/lib/explore-routes.server";

const HUBS = ["CAI", "DXB", "LHR", "JFK", "IST", "DOH", "FRA", "CDG", "JED", "SIN", "HND", "SFO"];

type Props = { params: Promise<{ iata: string }> };

export function generateStaticParams() {
  return HUBS.map((iata) => ({ iata }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { iata } = await params;
  const code = iata.trim().toUpperCase();
  const node = findAirportNode(code);
  const place = node ? `${node.city} (${code})` : code;
  const title = `Direct flights from ${place} · Avi Route Explorer`;
  const description = node
    ? `Explore every non-stop destination from ${node.name} in ${node.city}, ${node.country}. Compare each airport's approximate connectivity, distance, and cached arrival weather, then unlock the 3D Cabin & Seat Twin.`
    : `Explore non-stop destinations from ${code} on the Avi globe.`;
  return {
    title,
    description,
    alternates: { canonical: `/explore/${code}` },
    openGraph: {
      title,
      description,
      type: "website",
      url: `/explore/${code}`,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default function ExplorePage({ params }: Props) {
  return (
    <div className="explore-viewport w-full overflow-hidden">
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center bg-surface p-8 text-sm text-muted">
            Loading the Avi direct-route globe…
          </div>
        }
      >
        <ExploreContent params={params} />
      </Suspense>
    </div>
  );
}

async function ExploreContent({ params }: Props) {
  const { iata } = await params;
  const code = iata.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) notFound();
  const node = findAirportNode(code);
  if (!node) notFound();

  // Server-render the gateway route network so the static shell has real
  // destination content for SEO. A `null` result means the gateway is
  // unavailable or unconfigured; the client retries and shows an honest
  // unavailable state rather than a bundled static route dataset.
  const initialRoutes = await getExploreRoutes(code);
  const trafficByIata = Object.fromEntries(
    routeAirports.map((airport) => [airport.iata, airport.destCount ?? 0]),
  ) as Record<string, number>;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `Direct flights from ${node.city} (${code})`,
    description: `Non-stop destinations from ${node.name}, ${node.city}, ${node.country}.`,
    about: {
      "@type": "Airport",
      iataCode: code,
      name: node.name,
      address: { "@type": "PostalAddress", addressLocality: node.city, addressCountry: node.country },
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ExploreGlobe
        key={code}
        iata={code}
        airportName={node.name}
        city={node.city}
        country={node.country}
        trafficByIata={trafficByIata}
        initialRoutes={initialRoutes}
      />
    </>
  );
}
