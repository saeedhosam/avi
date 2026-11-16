"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Share2, Smartphone } from "lucide-react";
import type { Flight } from "@/lib/types";
import { STATUS_META } from "@/lib/utils";
import { Button, Field, Modal, Panel, TextInput } from "./ui";

function known(value: string | null | undefined): value is string {
  return Boolean(value) && value !== "—" && value !== "N/A" && value !== "TBD";
}

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
  const statusText = flight.statusReported
    ? `${statusEmoji} ${STATUS_META[flight.status].label}`
    : "❔ Status not reported";
  const delayText =
    flight.delayReported && flight.delayMinutes > 0
      ? ` (+${flight.delayMinutes}m delay${flight.delayReason ? `: ${flight.delayReason}` : "; reason not reported"})`
      : "";
  const etaText =
    flight.statusReported &&
    flight.status === "DEPARTED" &&
    flight.telemetry.hasLiveLocation &&
    flight.telemetry.etaMinutesRemaining > 0
      ? `\n⏳ ETA (calculated): ${flight.telemetry.etaMinutesRemaining} mins remaining (${flight.telemetry.distanceRemainingNm} NM)`
      : "";
  const noteText = personalNote.trim()
    ? `\n💬 Note: "${personalNote.trim()}"`
    : flight.customNotes
      ? `\n💬 Note: "${flight.customNotes}"`
      : "";

  const shareUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : "";
  const flightLink = `${shareUrl}/flight/${encodeURIComponent(flight.id)}${flight.flightDate ? `?date=${flight.flightDate}` : ""}`;
  const departureParts = [
    flight.departureTimeEstimated,
    known(flight.terminalDeparture) ? `Terminal ${flight.terminalDeparture}` : null,
    known(flight.gateDeparture) ? flight.gateDeparture : null,
  ].filter(Boolean);
  const arrivalParts = [
    flight.arrivalTimeEstimated,
    known(flight.terminalArrival) ? `Terminal ${flight.terminalArrival}` : null,
    known(flight.gateArrival) ? flight.gateArrival : null,
  ].filter(Boolean);

  return [
    "✈️ Avi Flight Status Update",
    "━━━━━━━━━━━━━━━━━━━━━",
    `Flight: ${flight.airline} (${flight.flightNumber})`,
    `Route: ${flight.origin.code} (${flight.origin.city}) ➔ ${flight.destination.code} (${flight.destination.city})`,
    `Status: ${statusText}${delayText}`,
    `Departure: ${departureParts.join(" · ")}`,
    `Arrival: ${arrivalParts.join(" · ")}`,
    known(flight.baggageCarousel)
      ? `Baggage: ${flight.baggageCarousel}`
      : "",
    flight.aircraft.model !== "Not reported"
      ? `Aircraft: ${flight.aircraft.model}${flight.aircraft.registration !== "Not reported" ? ` (${flight.aircraft.registration})` : ""}`
      : "",
  ]
    .filter(Boolean)
    .join("\n") + `${etaText}${noteText}` + `\n\n━━━━━━━━━━━━━━━━━━━━━\nView with Avi: ${flightLink}`;
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

  const statusMeta = STATUS_META[flight.status];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Share flight summary"
      subtitle="Departure, gate, delay and arrival details, ready to send."
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
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button size="sm" onClick={share}>
            <Smartphone className="size-3.5" /> Share via apps
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Add a note (optional)">
          <TextInput
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="e.g. Picking me up at Terminal 3?"
            autoComplete="off"
          />
        </Field>

        <Panel className="overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-line/60 px-3.5 py-2.5">
            <span className="label-caps text-subtle">Summary preview</span>
            <span
              className="rounded-md border px-2 py-0.5 text-xs font-medium"
              style={{
                color: statusMeta.color,
                borderColor: `${statusMeta.color}55`,
                backgroundColor: statusMeta.soft,
              }}
            >
              {statusMeta.label}
            </span>
          </div>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap px-3.5 py-3 font-mono text-xs leading-relaxed text-ink">
            {summary}
          </pre>
        </Panel>
      </div>
    </Modal>
  );
}
