import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ExploreExperience } from "@/components/explore-experience";
import { ExploreGlobeSkeleton } from "@/components/explore-globe-skeleton";
import { findAirportNode, routeAirports } from "@/lib/data";
import { getExploreRoutes } from "@/lib/explore-routes.server";
import type { ExploreAirport } from "@/lib/explore-types";

const HUBS = [
  "CAI",
  "DXB",
  "LHR",
  "JFK",
  "IST",
  "DOH",
  "FRA",
  "CDG",
  "JED",
  "SIN",
  "HND",
  "SFO",
];

type Props = { params: Promise<{ slug?: string[] }> };

function codeFromSlug(slug?: string[]): string | null {
  if (!slug?.length) return null;
  if (slug.length !== 1) return null;
  const code = slug[0].trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

export function generateStaticParams() {
  return HUBS.map((iata) => ({ slug: [iata] }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const code = codeFromSlug(slug);
  if (!code) {
    return {
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
  }

  const node = findAirportNode(code);
  const place = node ? `${node.city} (${code})` : code;
  return {
    title: node
      ? `Direct flights from ${place} · Avi Route Explorer`
      : `Direct flights from ${code} · Avi Route Explorer`,
    description: node
      ? `Explore every non-stop destination from ${node.name} in ${node.city}, ${node.country}. Compare each airport's active route count, distance, and cached arrival weather, then unlock the 3D Cabin & Seat Twin.`
      : `Explore non-stop destinations from ${code} on the Avi globe.`,
    alternates: { canonical: `/explore/${code}` },
    openGraph: {
      title: `Direct flights from ${place} · Avi Route Explorer`,
      description: node
        ? `Explore every non-stop destination from ${node.name} in ${node.city}, ${node.country}.`
        : `Explore non-stop destinations from ${code} on the Avi globe.`,
      type: "website",
      url: `/explore/${code}`,
    },
    twitter: {
      card: "summary_large_image",
      title: `Direct flights from ${place} · Avi Route Explorer`,
      description: node
        ? `Explore every non-stop destination from ${node.name} in ${node.city}, ${node.country}.`
        : `Explore non-stop destinations from ${code} on the Avi globe.`,
    },
  };
}

export default function ExplorePage({ params }: Props) {
  return (
    <div className="explore-viewport w-full overflow-hidden">
      <Suspense fallback={<ExploreGlobeSkeleton />}>
        <ExploreContent params={params} />
      </Suspense>
    </div>
  );
}

async function ExploreContent({ params }: Props) {
  const { slug } = await params;
  if (slug && slug.length > 1) notFound();

  const code = codeFromSlug(slug);
  if (slug?.length && !code) notFound();

  const airports: ExploreAirport[] = routeAirports
    .filter(
      (airport) =>
        !airport.historical &&
        (airport.destCount ?? 0) > 0 &&
        Number.isFinite(airport.latitude) &&
        Number.isFinite(airport.longitude),
    )
    .map(({ iata, name, city, country, latitude, longitude, destCount }) => ({
      iata,
      name,
      city,
      country,
      latitude,
      longitude,
      destCount: destCount ?? 0,
    }));

  const initialAirport = code
    ? (airports.find((airport) => airport.iata === code) ?? null)
    : null;
  if (code && !initialAirport) notFound();

  const initialRoutes = code ? await getExploreRoutes(code) : null;
  const jsonLd = initialAirport
    ? {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: `Direct flights from ${initialAirport.city} (${initialAirport.iata})`,
        description: `Non-stop destinations from ${initialAirport.name}, ${initialAirport.city}, ${initialAirport.country}.`,
        about: {
          "@type": "Airport",
          iataCode: initialAirport.iata,
          name: initialAirport.name,
          address: {
            "@type": "PostalAddress",
            addressLocality: initialAirport.city,
            addressCountry: initialAirport.country,
          },
        },
      }
    : null;

  return (
    <>
      {jsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      ) : null}
      <ExploreExperience
        airports={airports}
        initialAirport={initialAirport}
        initialRoutes={initialRoutes}
      />
    </>
  );
}
