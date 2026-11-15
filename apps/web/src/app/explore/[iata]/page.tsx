import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, Globe2, MapPin } from "lucide-react";
import { ExploreGlobe } from "@/components/explore-globe";
import { findAirportNode } from "@/lib/data";
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
  const title = `Direct flights from ${place} · AeroQuest Route Explorer`;
  const description = node
    ? `Explore every non-stop destination from ${node.name} in ${node.city}, ${node.country}. Filter by airline and haul, inspect distance and cached arrival weather, then unlock the 3D Cabin & Seat Twin.`
    : `Explore non-stop destinations from ${code} on the AeroQuest globe.`;
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
    <div className="mx-auto w-full max-w-[1440px] px-4 py-6 lg:px-8 lg:py-8">
      <Suspense
        fallback={
          <div className="rounded-xl border border-line/70 bg-surface p-8 text-sm text-muted">
            Loading the AeroQuest direct-route globe…
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
      <header className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Globe2 className="size-3.5 text-accent" />
            <span className="label-caps text-accent">Direct route explorer</span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Non-stop from {node.city}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            {node.name} · {code}. Destinations are colour-coded by haul,
            filterable by airline, and paired with cached arrival weather.
            Track a flight in the app to unlock the 3D cabin and Sprint Mode.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line/70 px-3 text-xs text-muted">
              <MapPin className="size-3.5" /> {node.city}, {node.country}
            </span>
            <Link
              href={`/routes?hub=${code}`}
              className="inline-flex min-h-9 items-center rounded-lg border border-line/70 px-3 text-xs font-medium text-ink transition-colors hover:border-line-strong"
            >
              Airport board &amp; planner
            </Link>
            <Link
              href="/search"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line/70 px-3 text-xs font-medium text-ink transition-colors hover:border-line-strong"
            >
              <ArrowLeft className="size-3.5" /> Track a flight
            </Link>
          </div>
        </div>
        <div className="max-w-xs rounded-xl border border-line/60 bg-surface/60 p-3.5 text-xs text-muted">
          <p className="label-caps text-subtle">Starter-safe by design</p>
          <p className="mt-1.5 leading-relaxed">
            Clients never call AeroDataBox. The gateway caches this network for
            7 days and coalesces refreshes into one provider call.
          </p>
        </div>
      </header>
      <ExploreGlobe
        key={code}
        iata={code}
        airportName={node.name}
        city={node.city}
        initialRoutes={initialRoutes}
      />
    </>
  );
}
