import Link from "next/link";
import { PlaneLanding, Sparkles, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";

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
      className={cn(
        "rounded-lg border border-delayed/30 bg-delayed/8",
        compact ? "px-3 py-2.5" : "p-4",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-delayed/35 bg-delayed/10 text-delayed">
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="label-caps text-delayed">
            Flight delayed {Math.round(delayMinutes / 60)}h+
          </p>
          <p className="mt-1 text-[13px] font-medium text-ink">
            Unlock nearby lounge access
          </p>
          {!compact && (
            <p className="mt-1 text-xs leading-relaxed text-muted">
              A long delay is a good time to reset. Compare lounges at this
              terminal and check access with your card or a day pass.
            </p>
          )}
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <a
              href={LOUNGE_URL}
              target="_blank"
              rel="noreferrer sponsored"
              className="inline-flex h-8 items-center rounded-lg bg-delayed px-2.5 text-xs font-semibold text-[color:var(--bg)] transition-opacity hover:opacity-90"
            >
              Find a lounge
            </a>
            {flightNumber ? (
              <Link
                href={`/map/${encodeURIComponent(flightNumber)}`}
                className="inline-flex h-8 items-center rounded-lg border border-delayed/35 px-2.5 text-xs font-medium text-delayed transition-colors hover:bg-delayed/10"
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
    <div className="rounded-lg border border-accent/25 bg-accent-soft p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-accent/30 bg-accent/10 text-accent">
          <PlaneLanding className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="label-caps text-accent">
            Landing in {destinationCountry}
          </p>
          <p className="mt-1 text-[13px] font-medium text-ink">
            Get instant eSIM data for {destinationCity}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Skip the airport SIM queue. Install a data plan before you leave the
            aircraft and stay connected on arrival.
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <a
              href={ESIM_URL}
              target="_blank"
              rel="noreferrer sponsored"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-2.5 text-xs font-semibold text-[color:var(--bg)] transition-opacity hover:opacity-90"
            >
              <Wifi className="size-3.5" /> Get instant eSIM
            </a>
            <span className="text-xs text-subtle">
              Affiliate link · no extra cost to you
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
