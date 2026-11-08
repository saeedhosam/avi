package com.example.data

import com.example.model.AlertType
import com.example.model.Flight
import com.example.model.FlightAlert
import com.example.model.FlightStatus
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID

/**
 * Diffs previous vs. updated [Flight] state snapshots for tracked flights and emits
 * real-time [FlightAlert] records only when a genuine operational change occurred.
 */
object FlightStateDiffer {

    fun diffFlights(previous: Flight, updated: Flight): List<FlightAlert> {
        val alerts = mutableListOf<FlightAlert>()
        val timeLabel = SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date())

        // 1. Check Gate Change
        if (updated.gateDeparture.isNotBlank() &&
            !updated.gateDeparture.contains("TBD", ignoreCase = true) &&
            !previous.gateDeparture.equals(updated.gateDeparture, ignoreCase = true)
        ) {
            alerts.add(
                FlightAlert(
                    id = UUID.randomUUID().toString(),
                    flightNumber = updated.flightNumber,
                    type = AlertType.GATE_CHANGE,
                    title = "Gate Reassigned: ${updated.flightNumber}",
                    message = "${updated.airline} ${updated.flightNumber} departure gate changed from ${previous.gateDeparture} to ${updated.gateDeparture} (Terminal ${updated.terminalDeparture}).",
                    timestamp = timeLabel,
                    isRead = false
                )
            )
        }

        // 2. Check Delay Increase (>= 15m difference)
        if (updated.delayMinutes - previous.delayMinutes >= 15) {
            alerts.add(
                FlightAlert(
                    id = UUID.randomUUID().toString(),
                    flightNumber = updated.flightNumber,
                    type = AlertType.DELAY,
                    title = "Schedule Delay: ${updated.flightNumber} (+${updated.delayMinutes}m)",
                    message = "Flight ${updated.flightNumber} (${updated.origin.code} ➔ ${updated.destination.code}) is now delayed by ${updated.delayMinutes} minutes. Revised departure: ${updated.departureTimeEstimated}.",
                    timestamp = timeLabel,
                    isRead = false
                )
            )
        }

        // 3. Check Operational Status Transition
        if (previous.status != updated.status) {
            when (updated.status) {
                FlightStatus.BOARDING -> {
                    alerts.add(
                        FlightAlert(
                            id = UUID.randomUUID().toString(),
                            flightNumber = updated.flightNumber,
                            type = AlertType.BOARDING,
                            title = "Boarding Commenced: ${updated.flightNumber}",
                            message = "${updated.airline} ${updated.flightNumber} is now boarding at ${updated.gateDeparture}.",
                            timestamp = timeLabel,
                            isRead = false
                        )
                    )
                }
                FlightStatus.CANCELLED -> {
                    alerts.add(
                        FlightAlert(
                            id = UUID.randomUUID().toString(),
                            flightNumber = updated.flightNumber,
                            type = AlertType.CANCELLATION,
                            title = "Flight Cancelled: ${updated.flightNumber}",
                            message = "${updated.airline} ${updated.flightNumber} (${updated.origin.code} ➔ ${updated.destination.code}) has been cancelled.",
                            timestamp = timeLabel,
                            isRead = false
                        )
                    )
                }
                FlightStatus.LANDED -> {
                    alerts.add(
                        FlightAlert(
                            id = UUID.randomUUID().toString(),
                            flightNumber = updated.flightNumber,
                            type = AlertType.BAGGAGE,
                            title = "Touchdown at ${updated.destination.code}: ${updated.flightNumber}",
                            message = "${updated.flightNumber} has landed at ${updated.destination.city}. Baggage claim assigned to ${updated.baggageCarousel}.",
                            timestamp = timeLabel,
                            isRead = false
                        )
                    )
                }
                else -> {}
            }
        }

        return alerts
    }
}
