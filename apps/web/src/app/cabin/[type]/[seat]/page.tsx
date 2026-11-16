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
import { Button, PageHeader, Panel } from "@/components/ui";

const CabinViewer3D = dynamic(
  () => import("@avi/ui/cabin/CabinViewer3D").then((module) => module.CabinViewer3D),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[420px] items-center justify-center bg-surface text-sm text-muted">
        Loading the 3D cabin twin…
      </div>
    ),
  },
);

const QUICK_SEATS = ["1A", "2K", "9A", "14A", "26D", "30K", "42A"];

export default function CabinPage() {
  const params = useParams<{ type?: string; seat?: string }>();
  const type = (params.type ?? "B77W").toUpperCase();
  const initialSeat = (params.seat ?? "14A").toUpperCase();
  const [seatNumber, setSeatNumber] = useState(initialSeat);
  // Repeating seat labels exist on multiple decks of a widebody. Track the
  // deck so the 3D highlight and the report agree on one physical seat.
  const [deck, setDeck] = useState<number | null>(null);
  const layout = useMemo(() => resolveCabinLayout(type), [type]);
  const resolved = useMemo(
    () => resolveSeat(layout, seatNumber, deck == null ? undefined : { deck }),
    [layout, seatNumber, deck],
  );
  const activeDeck = deck ?? resolved.seat?.deck ?? null;
  const deckName =
    layout.decks.find((item) => item.index === activeDeck)?.name ?? null;

  const onSeatSelect = (seat: CabinSeat) => {
    setSeatNumber(seat.id);
    setDeck(seat.deck);
  };
  const jumpTo = (candidate: string) => {
    setSeatNumber(candidate);
    setDeck(null);
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 lg:px-8 lg:py-8">
      <PageHeader
        eyebrow="Avi Pro · 3D cabin"
        title={
          <span className="flex flex-wrap items-center gap-3">
            {layout.aircraftType} seat {seatNumber || "—"}
            <Badge>{deckName ?? "Deck"}</Badge>
          </span>
        }
        description="A free interactive preview of the parametric cabin reconstruction. Tap a seat to inspect window alignment, pitch, power, nearby lavatories, galleys and exits. Details are reconstructed from the aircraft type, not a certified cabin plan."
        actions={
          <Link href="/explore/CAI">
            <Button size="sm" variant="ghost">
              Route explorer
            </Button>
          </Link>
        }
      />

      <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px] xl:gap-6">
        <Panel className="h-[480px] overflow-hidden lg:h-[560px]">
          <CabinViewer3D
            layout={layout}
            selectedSeat={seatNumber}
            selectedDeck={activeDeck}
            onSeatSelect={onSeatSelect}
            autoRotate
            className="h-full w-full"
          />
        </Panel>

        <div className="space-y-4">
          <Panel className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="label-caps text-subtle">Seat report</p>
                <p className="mt-1 font-mono text-3xl font-semibold tracking-tight text-ink">
                  {resolved.seat?.id ?? seatNumber}
                </p>
                <p className="mt-0.5 text-xs text-subtle">
                  {deckName ?? "Deck not resolved"}
                </p>
              </div>
              {resolved.seat && (
                <Badge>{resolved.seat.seatClass.replace("_", " ")}</Badge>
              )}
            </div>

            {layout.decks.length > 1 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {layout.decks.map((item) => (
                  <button
                    key={item.index}
                    type="button"
                    onClick={() => setDeck(item.index)}
                    aria-pressed={activeDeck === item.index}
                    className={cn(
                      "min-h-9 rounded-md border px-3 text-xs font-medium transition-colors",
                      activeDeck === item.index
                        ? "border-accent/40 bg-accent-soft text-accent"
                        : "border-line/70 text-muted hover:text-ink",
                    )}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            )}

            {resolved.seat ? (
              <>
                <dl className="mt-4 space-y-2.5 border-t border-line/60 pt-3 text-[13px]">
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
                <p className="mt-3 border-t border-line/60 pt-3 text-xs leading-relaxed text-muted">
                  Nearby:{" "}
                  {resolved.nearbyFeatures.length
                    ? resolved.nearbyFeatures
                        .map((feature) => feature.label)
                        .join(" · ")
                    : "No mapped features"}
                </p>
              </>
            ) : (
              <p className="mt-3 rounded-lg border border-delayed/30 bg-delayed/8 px-3 py-2.5 text-sm leading-relaxed text-muted">
                Seat {seatNumber} is not present on {deckName ?? "this deck"}. No
                window, pitch, or power claim is generated.
              </p>
            )}
          </Panel>

          <Panel className="p-4">
            <p className="label-caps text-subtle">Jump to a seat</p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {QUICK_SEATS.map((candidate) => (
                <button
                  key={candidate}
                  type="button"
                  onClick={() => jumpTo(candidate)}
                  aria-pressed={seatNumber === candidate}
                  className={cn(
                    "min-h-9 rounded-md border px-3 font-mono text-xs font-medium transition-colors",
                    seatNumber === candidate
                      ? "border-accent/40 bg-accent-soft text-accent"
                      : "border-line/70 text-muted hover:text-ink",
                  )}
                >
                  {candidate}
                </button>
              ))}
            </div>
            <p className="mt-2.5 text-xs leading-relaxed text-subtle">
              Repeating labels such as 14A exist on more than one deck. Choose
              the deck above before comparing.
            </p>
          </Panel>

          <Panel className="p-4">
            <p className="label-caps text-subtle">Overhead bin</p>
            {layout.overheadBins.map((bin) => (
              <p
                key={bin.aircraftType}
                className="mt-2 text-sm font-medium text-ink"
              >
                {bin.widthCm} × {bin.heightCm} × {bin.depthCm} cm ·{" "}
                {bin.carryOnCapacity} standard bags
              </p>
            ))}
            <p className="mt-2 text-xs leading-relaxed text-subtle">
              {layout.disclaimer}
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md border border-line/70 bg-surface-2/50 px-2 py-1 text-xs font-medium uppercase tracking-wide text-muted">
      {children}
    </span>
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
