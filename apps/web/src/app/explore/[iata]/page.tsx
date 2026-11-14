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
    <div className="app-bg min-h-screen">
      <main className="mx-auto w-full max-w-[1500px] px-4 py-6 lg:px-8">
        <Suspense
          fallback={
            <div className="rounded-3xl border border-line bg-surface p-8 text-sm text-muted">
              Loading the AeroQuest direct-route globe…
            </div>
          }
        >
          <ExploreContent params={params} />
        </Suspense>
      </main>
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
      <header className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-accent">
            <Globe2 className="size-3.5" />
            AeroQuest Direct Route Explorer
          </div>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-ink lg:text-5xl">
            Everywhere non-stop from {node.city}
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted">
            {node.name} · {code}. Direct destinations colour-coded by haul,
            filterable by airline, with cached arrival weather. Track a flight in
            the app to unlock the 3D Cabin & Seat Twin and Sprint Mode.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-muted">
              <MapPin className="size-3" /> {node.city}, {node.country}
            </span>
            <Link
              href={`/routes?hub=${code}`}
              className="rounded-full border border-line px-2.5 py-1 font-semibold text-ink hover:border-accent/50"
            >
              Open airport board &amp; planner
            </Link>
            <Link
              href="/search"
              className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 font-semibold text-ink hover:border-accent/50"
            >
              <ArrowLeft className="size-3" /> Track a flight
            </Link>
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-3 text-[11px] text-muted">
          <p className="font-bold uppercase tracking-[0.16em] text-accent">
            Starter-safe by design
          </p>
          <p className="mt-1 max-w-xs">
            Clients never call AeroDataBox. The Hetzner gateway caches this
            network for 7 days and coalesces refreshes into one provider call.
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
