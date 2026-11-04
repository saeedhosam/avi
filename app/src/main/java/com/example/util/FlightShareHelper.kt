package com.example.util

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import com.example.model.Flight
import com.example.model.FlightStatus

object FlightShareHelper {

    fun generateFlightSummary(flight: Flight, personalNote: String = ""): String {
        val statusEmoji = when (flight.status) {
            FlightStatus.DEPARTED -> "🛫"
            FlightStatus.BOARDING -> "🎫"
            FlightStatus.LANDED -> "🛬"
            FlightStatus.DELAYED -> "⚠️"
            FlightStatus.CANCELLED -> "❌"
            FlightStatus.SCHEDULED -> "🕒"
        }

        val delayText = if (flight.delayMinutes > 0) {
            " (+${flight.delayMinutes}m delay: ${flight.delayReason ?: "ATC Flow"})"
        } else ""

        val etaText = if (flight.status == FlightStatus.DEPARTED) {
            "\n⏳ ETA Countdown: ${flight.telemetry.etaMinutesRemaining} mins remaining (${flight.telemetry.distanceRemainingNm} NM)"
        } else ""

        val noteText = if (personalNote.isNotBlank()) {
            "\n💬 Note: \"$personalNote\""
        } else if (flight.customNotes.isNotBlank()) {
            "\n💬 Note: \"${flight.customNotes}\""
        } else ""

        return buildString {
            appendLine("✈️ SkyTrack Flight Status Update")
            appendLine("━━━━━━━━━━━━━━━━━━━━━")
            appendLine("Flight: ${flight.airline} (${flight.flightNumber})")
            appendLine("Route: ${flight.origin.code} (${flight.origin.city}) ➔ ${flight.destination.code} (${flight.destination.city})")
            appendLine("Status: $statusEmoji ${flight.status.label}$delayText")
            appendLine("Departure: ${flight.departureTimeEstimated} · Terminal ${flight.terminalDeparture}, Gate ${flight.gateDeparture}")
            appendLine("Arrival: ${flight.arrivalTimeEstimated} · Terminal ${flight.terminalArrival}, Gate ${flight.gateArrival}")
            if (flight.baggageCarousel.isNotBlank() && flight.baggageCarousel != "N/A") {
                appendLine("Baggage: ${flight.baggageCarousel}")
            }
            appendLine("Aircraft: ${flight.aircraft.model} (${flight.aircraft.registration})")
            if (etaText.isNotBlank()) append(etaText)
            if (noteText.isNotBlank()) append(noteText)
            appendLine()
            appendLine("━━━━━━━━━━━━━━━━━━━━━")
            append("Track live with SkyTrack: https://skytrack.aero/track/${flight.flightNumber.replace(" ", "")}")
        }
    }

    fun shareFlight(context: Context, flight: Flight, personalNote: String = "") {
        val summary = generateFlightSummary(flight, personalNote)
        val subject = "Flight Update: ${flight.flightNumber} (${flight.origin.code} ➔ ${flight.destination.code})"

        val sendIntent = Intent().apply {
            action = Intent.ACTION_SEND
            putExtra(Intent.EXTRA_TEXT, summary)
            putExtra(Intent.EXTRA_SUBJECT, subject)
            putExtra(Intent.EXTRA_TITLE, subject)
            type = "text/plain"
        }

        val shareIntent = Intent.createChooser(sendIntent, "Share Flight Status via").apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        context.startActivity(shareIntent)
    }

    fun copyToClipboard(context: Context, text: String, label: String = "Flight Status") {
        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
        val clip = ClipData.newPlainText(label, text)
        clipboard?.setPrimaryClip(clip)
    }
}
