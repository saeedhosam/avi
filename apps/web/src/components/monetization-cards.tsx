import Link from "next/link";
import { PlaneLanding, Sparkles, Wifi } from "lucide-react";

const LOUNGE_URL =
  process.env.NEXT_PUBLIC_LOUNGE_AFFILIATE_URL?.trim() ||
  "https://www.prioritypass.com/en/find-a-lounge";
const ESIM_URL =
  process.env.NEXT_PUBLIC_ESIM_AFFILIATE_URL?.trim() ||
  "https://www.airalo.com/";

/**
 * Contextual, non-banner monetisation.
 *
 * - A delay of 2+ hours gets a lounge-access affiliate hook.
 * - A landed international flight gets an arrival eSIM hook.
 *
 * Both cards are honest about the trigger and never interrupt the primary
 * flight-status content.
 */
export function DelayLoungeCard({
  delayMinutes,
  flightNumber,
  compact = false,
}: {
  delayMinutes: number;
  flightNumber?: string;
  compact?: boolean;
}) {
  if (!Number.isFinite(delayMinutes) || delayMinutes < 120) return null;
  return (
    <div
      className={
        compact
          ? "rounded-2xl border border-[#f59e0b]/40 bg-[#f59e0b]/10 p-3"
          : "rounded-2xl border border-[#f59e0b]/40 bg-[#f59e0b]/10 p-4"
      }
    >
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-[#f59e0b]/50 bg-[#f59e0b]/15 text-[#fbbf24]">
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#fbbf24]">
            Flight delayed {Math.round(delayMinutes / 60)}h+
          </p>
          <p className="mt-1 text-sm font-bold text-ink">
            Unlock nearby lounge access
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            A long delay is a good time to reset. Compare lounges at this
            terminal and check access with your card or a day pass.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <a
              href={LOUNGE_URL}
              target="_blank"
              rel="noreferrer sponsored"
              className="rounded-lg bg-[#fbbf24] px-2.5 py-1.5 text-[10px] font-extrabold text-[#1a1204]"
            >
              Find a lounge
            </a>
            {flightNumber ? (
              <Link
                href={`/map/${encodeURIComponent(flightNumber)}`}
                className="rounded-lg border border-[#f59e0b]/40 px-2.5 py-1.5 text-[10px] font-bold text-[#fbbf24]"
              >
                View live flight
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ArrivalEsimCard({
  status,
  originCountry,
  destinationCountry,
  destinationCity,
}: {
  status: string;
  originCountry: string;
  destinationCountry: string;
  destinationCity: string;
}) {
  const international =
    Boolean(originCountry && destinationCountry) &&
    originCountry.trim().toUpperCase() !== destinationCountry.trim().toUpperCase();
  if (status !== "LANDED" || !international) return null;
  return (
    <div className="rounded-2xl border border-[#22d3ee]/40 bg-[#22d3ee]/10 p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-[#22d3ee]/50 bg-[#22d3ee]/15 text-[#22d3ee]">
          <PlaneLanding className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#22d3ee]">
            Landing in {destinationCountry}
          </p>
          <p className="mt-1 text-sm font-bold text-ink">
            Get instant eSIM data for {destinationCity}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            Skip the airport SIM queue. Install a data plan before you leave the
            aircraft and stay connected on arrival.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <a
              href={ESIM_URL}
              target="_blank"
              rel="noreferrer sponsored"
              className="inline-flex items-center gap-1 rounded-lg bg-[#22d3ee] px-2.5 py-1.5 text-[10px] font-extrabold text-[#06111d]"
            >
              <Wifi className="size-3" /> Get instant eSIM
            </a>
            <span className="text-[9px] text-subtle">
              Affiliate link · no extra cost to you
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
