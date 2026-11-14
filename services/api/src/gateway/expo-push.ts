import { randomUUID } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import type { Flight, FlightAlert } from "@avi/shared";
import type { AppConfig } from "../config.js";
import type {
  ExpoDeviceToken,
  SupabaseAlertBody,
  SupabaseServer,
} from "../lib/supabase-server.js";

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  sound: "default";
  priority: "high";
  data: {
    alertId: string;
    flightNumber: string;
    flightDate: string | null;
    type: string;
    url: string;
  };
}

interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

interface ExpoPushResponse {
  data?: ExpoPushTicket[];
}

export interface ExpoFanoutStats {
  subscribers: number;
  tokens: number;
  alertsInserted: number;
  pushesSent: number;
  deliveredAlertsMarked: number;
  tokensRemoved: number;
  error: string | null;
}

/**
 * Native Expo push fan-out for gateway-detected flight changes.
 *
 * Alerts are inserted for every subscriber first. Users with a native token
 * get an Expo push and their alert row is marked delivered so the web-push
 * loop does not duplicate it. Users without a native token keep an undelivered
 * alert for the existing web-push delivery path.
 */
export class ExpoPushService {
  constructor(
    private readonly config: AppConfig,
    private readonly supabase: SupabaseServer,
    private readonly log: FastifyBaseLogger,
  ) {}

  configured(): boolean {
    return this.supabase.ready;
  }

  async notifyFlightChanges(
    flight: Flight,
    alerts: FlightAlert[],
  ): Promise<ExpoFanoutStats> {
    const stats: ExpoFanoutStats = {
      subscribers: 0,
      tokens: 0,
      alertsInserted: 0,
      pushesSent: 0,
      deliveredAlertsMarked: 0,
      tokensRemoved: 0,
      error: null,
    };
    if (!this.configured() || !alerts.length || !flight.flightDate) return stats;

    try {
      const userIds = await this.supabase.listFlightSubscriberIds(
        flight.flightNumber,
        flight.flightDate,
      );
      stats.subscribers = userIds.length;
      if (!userIds.length) return stats;

      const tokens = await this.supabase.listExpoTokens(userIds);
      stats.tokens = tokens.length;
      const tokensByUser = new Map<string, ExpoDeviceToken[]>();
      for (const token of tokens) {
        const list = tokensByUser.get(token.user_id) ?? [];
        list.push(token);
        tokensByUser.set(token.user_id, list);
      }

      const alertRows: Array<
        SupabaseAlertBody & { id: string; rowId: string; userId: string }
      > = [];
      for (const userId of userIds) {
        for (const alert of alerts) {
          alertRows.push({
            rowId: randomUUID(),
            userId,
            id: randomUUID(),
            user_id: userId,
            flight_number: alert.flightNumber,
            flight_date: alert.flightDate ?? flight.flightDate,
            alert_type: alert.type,
            title: alert.title,
            message: alert.message,
            is_read: false,
          });
        }
      }
      await this.supabase.insertAlerts(
        alertRows.map(({ rowId: _rowId, userId: _userId, ...row }) => row),
      );
      stats.alertsInserted = alertRows.length;

      const nativeRows = alertRows.filter((row) => tokensByUser.has(row.userId));
      if (!nativeRows.length) return stats;

      const messages: Array<{ rowId: string; message: ExpoPushMessage }> = [];
      for (const row of nativeRows) {
        const rowTokens = tokensByUser.get(row.userId) ?? [];
        for (const token of rowTokens) {
          messages.push({
            rowId: row.rowId,
            message: {
              to: token.token,
              title: row.title,
              body: row.message,
              sound: "default",
              priority: "high",
              data: {
                alertId: row.id,
                flightNumber: row.flight_number,
                flightDate: row.flight_date ?? null,
                type: row.alert_type,
                url: `/flight/${row.flight_number.replace(/\s+/g, "")}`,
              },
            },
          });
        }
      }

      const deliveredRowIds = new Set<string>();
      const staleTokens = new Set<string>();
      for (let index = 0; index < messages.length; index += 100) {
        const batch = messages.slice(index, index + 100);
        const result = await this.sendBatch(batch.map((entry) => entry.message));
        result.forEach((ticket, ticketIndex) => {
          const entry = batch[ticketIndex];
          if (!entry) return;
          if (ticket.status === "ok") {
            deliveredRowIds.add(entry.rowId);
            stats.pushesSent += 1;
          } else if (ticket.details?.error === "DeviceNotRegistered") {
            staleTokens.add(entry.message.to);
          }
        });
      }

      if (deliveredRowIds.size > 0) {
        const rowIds = alertRows
          .filter((row) => deliveredRowIds.has(row.rowId))
          .map((row) => row.id);
        await this.supabase.markAlertsDelivered(rowIds);
        stats.deliveredAlertsMarked = rowIds.length;
      }

      for (const token of staleTokens) {
        try {
          await this.supabase.deleteDeviceToken(token);
          stats.tokensRemoved += 1;
        } catch (error) {
          this.log.warn({ err: error }, "expo token cleanup failed");
        }
      }
    } catch (error) {
      stats.error = error instanceof Error ? error.message : String(error);
      this.log.error({ err: error }, "expo push fan-out failed");
    }
    return stats;
  }

  private async sendBatch(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
    if (!messages.length) return [];
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
        ...(this.config.EXPO_ACCESS_TOKEN
          ? { Authorization: `Bearer ${this.config.EXPO_ACCESS_TOKEN}` }
          : {}),
      },
      body: JSON.stringify(messages),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`Expo push returned HTTP ${response.status}`);
    }
    const body = (await response.json().catch(() => null)) as ExpoPushResponse | null;
    return Array.isArray(body?.data) ? body.data : [];
  }
}
