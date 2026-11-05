"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Share2, Smartphone } from "lucide-react";
import type { Flight } from "@/lib/types";
import { STATUS_META } from "@/lib/utils";
import { Button, Modal } from "./ui";

export function generateFlightSummary(flight: Flight, personalNote = "") {
  const statusEmoji =
    flight.status === "DEPARTED"
      ? "🛫"
      : flight.status === "BOARDING"
        ? "🎫"
        : flight.status === "LANDED"
          ? "🛬"
          : flight.status === "DELAYED"
            ? "⚠️"
            : flight.status === "CANCELLED"
              ? "❌"
              : "🕒";
  const delayText =
    flight.delayMinutes > 0
      ? ` (+${flight.delayMinutes}m delay: ${flight.delayReason ?? "ATC Flow"})`
      : "";
  const etaText =
    flight.status === "DEPARTED"
      ? `\n⏳ ETA Countdown: ${flight.telemetry.etaMinutesRemaining} mins remaining (${flight.telemetry.distanceRemainingNm} NM)`
      : "";
  const noteText = personalNote.trim()
    ? `\n💬 Note: "${personalNote.trim()}"`
    : flight.customNotes
      ? `\n💬 Note: "${flight.customNotes}"`
      : "";

  return [
    "✈️ Avi Flight Status Update",
    "━━━━━━━━━━━━━━━━━━━━━",
    `Flight: ${flight.airline} (${flight.flightNumber})`,
    `Route: ${flight.origin.code} (${flight.origin.city}) ➔ ${flight.destination.code} (${flight.destination.city})`,
    `Status: ${statusEmoji} ${STATUS_META[flight.status].label}${delayText}`,
    `Departure: ${flight.departureTimeEstimated} · Terminal ${flight.terminalDeparture}, ${flight.gateDeparture}`,
    `Arrival: ${flight.arrivalTimeEstimated} · Terminal ${flight.terminalArrival}, ${flight.gateArrival}`,
    flight.baggageCarousel && flight.baggageCarousel !== "N/A"
      ? `Baggage: ${flight.baggageCarousel}`
      : "",
    `Aircraft: ${flight.aircraft.model} (${flight.aircraft.registration})`,
  ]
    .filter(Boolean)
    .join("\n") + `${etaText}${noteText}` + `\n\n━━━━━━━━━━━━━━━━━━━━━\nTrack live with Avi: https://app.2-31-110-53.sslip.io/flight/${flight.flightNumber.replace(/\s+/g, "")}`;
}

export function ShareFlightDialog({
  flight,
  open,
  onClose,
}: {
  flight: Flight;
  open: boolean;
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  const summary = useMemo(
    () => generateFlightSummary(flight, note),
    [flight, note],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard access is optional.
    }
  };

  const share = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: `Flight Update: ${flight.flightNumber}`,
          text: summary,
        });
        onClose();
        return;
      } catch {
        // Fall back to copying.
      }
    }
    await copy();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Share flight summary"
      subtitle="Send real-time departure, gate, delay, and arrival updates to friends and family."
      icon={<Share2 className="size-4" />}
      size="md"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="outline" size="sm" onClick={copy}>
            {copied ? (
              <Check className="size-3.5 text-landed" />
            ) : (
              <Copy className="size-3.5" />
            )}
            {copied ? "Copied!" : "Copy"}
          </Button>
          <Button size="sm" onClick={share}>
            <Smartphone className="size-3.5" /> Share via apps
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className="label-caps text-subtle">Add a note (optional)</span>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="e.g. Picking me up at Terminal 3?"
            className="mt-1 h-10 w-full rounded-xl border border-line bg-surface-2 px-3 text-xs text-ink outline-none placeholder:text-subtle focus:border-accent"
          />
        </label>
        <div className="rounded-xl border border-line bg-surface-2">
          <div className="flex items-center justify-between border-b border-line/60 px-3 py-2">
            <span className="label-caps text-subtle">Summary preview</span>
            <span
              className="rounded-full border px-2 py-0.5 text-[9px] font-bold"
              style={{
                color: STATUS_META[flight.status].color,
                borderColor: `${STATUS_META[flight.status].color}55`,
                backgroundColor: STATUS_META[flight.status].soft,
              }}
            >
              {STATUS_META[flight.status].label}
            </span>
          </div>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap px-3 py-2.5 font-mono text-[10.5px] leading-relaxed text-ink">
            {summary}
          </pre>
        </div>
      </div>
    </Modal>
  );
}
