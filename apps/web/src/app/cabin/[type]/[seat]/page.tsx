"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  resolveCabinLayout,
  resolveSeat,
  type CabinSeat,
} from "@avi/shared";
import { cn } from "@/lib/utils";
import { UpgradeCta } from "@/components/upgrade-cta";

const CabinViewer3D = dynamic(
  () => import("@avi/ui/cabin/CabinViewer3D").then((module) => module.CabinViewer3D),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[520px] items-center justify-center rounded-3xl border border-line bg-surface text-sm text-muted">
        Loading the 3D cabin twin…
      </div>
    ),
  },
);

export default function CabinPage() {
  const params = useParams<{ type?: string; seat?: string }>();
  const type = (params.type ?? "B77W").toUpperCase();
  const initialSeat = (params.seat ?? "14A").toUpperCase();
  const [seatNumber, setSeatNumber] = useState(initialSeat);
  const layout = useMemo(() => resolveCabinLayout(type), [type]);
  const resolved = useMemo(() => resolveSeat(layout, seatNumber), [layout, seatNumber]);

  const onSeatSelect = (seat: CabinSeat) => setSeatNumber(seat.id);

  return (
    <main className="mx-auto w-full max-w-[1500px] px-4 py-6 lg:px-8">
      <header className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent">
            AeroQuest Pro · 3D Cabin & Seat Twin
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-ink lg:text-5xl">
            {layout.aircraftType} seat {seatNumber || "—"}
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted">
            A free interactive preview of the parametric cabin reconstruction:
            tap a seat to highlight it, then inspect window alignment, pitch,
            power, lavatories, galleys, and emergency exits. Live seat tracking
            and saved trip cabins are AeroQuest Pro or Single-Trip Pass features.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/explore/CAI"
            className="rounded-xl border border-line px-3 py-2 text-xs font-bold text-ink hover:border-accent/50"
          >
            Back to route explorer
          </Link>
          <a
            href={`aeroquest://cabin/${layout.aircraftType}/${seatNumber}`}
            className="rounded-xl bg-accent px-3 py-2 text-xs font-bold text-[color:var(--bg)]"
          >
            Open in app
          </a>
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="h-[520px] overflow-hidden rounded-3xl border border-line bg-surface">
          <CabinViewer3D
            layout={layout}
            selectedSeat={seatNumber}
            onSeatSelect={onSeatSelect}
            autoRotate
            className="h-full w-full"
          />
        </div>

        <div className="space-y-3">
          <section className="rounded-3xl border border-line bg-surface p-4">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-accent">
              Seat report
            </p>
            {resolved.seat ? (
              <>
                <div className="mt-1 flex items-baseline justify-between gap-3">
                  <p className="text-4xl font-black text-ink">{resolved.seat.id}</p>
                  <span className="rounded-full border border-line px-2 py-1 text-[10px] font-bold text-muted">
                    {resolved.seat.seatClass.replace("_", " ")}
                  </span>
                </div>
                <dl className="mt-3 space-y-2 text-xs">
                  <Detail label="Window" value={resolved.windowNote} />
                  <Detail label="Legroom" value={resolved.legroomNote} />
                  <Detail label="Power" value={resolved.powerNote} />
                  <Detail
                    label="Lavatory"
                    value={
                      resolved.distanceToLavatoryMeters != null
                        ? `~${resolved.distanceToLavatoryMeters} m`
                        : "Not reported"
                    }
                  />
                  <Detail
                    label="Exit"
                    value={
                      resolved.distanceToExitMeters != null
                        ? `~${resolved.distanceToExitMeters} m`
                        : "Not reported"
                    }
                  />
                </dl>
                <p className="mt-3 text-[11px] text-muted">
                  Nearby:{" "}
                  {resolved.nearbyFeatures.length
                    ? resolved.nearbyFeatures.map((feature) => feature.label).join(" · ")
                    : "No mapped features"}
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-[#fbbf24]">
                Seat {seatNumber} is not in this layout. No window, pitch, or
                power claim is generated.
              </p>
            )}
          </section>

          <section className="rounded-3xl border border-line bg-surface p-4">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-accent">
              Jump to a seat
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {["1A", "2K", "9A", "14A", "26D", "30K", "42A"].map((candidate) => (
                <button
                  key={candidate}
                  type="button"
                  onClick={() => setSeatNumber(candidate)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[10px] font-bold",
                    seatNumber === candidate
                      ? "border-accent bg-accent text-[color:var(--bg)]"
                      : "border-line text-muted hover:text-ink",
                  )}
                >
                  {candidate}
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-line bg-surface p-4">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-accent">
              Overhead bin
            </p>
            {layout.overheadBins.map((bin) => (
              <p key={bin.aircraftType} className="mt-2 text-sm font-semibold text-ink">
                {bin.widthCm} × {bin.heightCm} × {bin.depthCm} cm ·{" "}
                {bin.carryOnCapacity} standard bags
              </p>
            ))}
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              {layout.disclaimer}
            </p>
          </section>

          <UpgradeCta
            title="This cabin preview is free."
            body="AeroQuest Pro or the $4.99 Single-Trip Pass unlocks saved trip cabins, live seat tracking, Sprint Mode, and the offline in-flight HUD. The 3D preview never requires payment."
          />
        </div>
      </div>
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="text-right font-medium text-ink">{value}</dd>
    </div>
  );
}
