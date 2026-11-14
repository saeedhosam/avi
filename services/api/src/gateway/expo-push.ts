import { randomUUID } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import type { Flight, FlightAlert } from "@avi/shared";
import type { AppConfig } from "../config.js";
import type {
  ExpoDeviceToken,
  ExpoPushReceiptInput,
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

interface ExpoPushReceipt {
  status: "ok" | "error";
  message?: string;
  details?: { error?: string };
}

interface ExpoReceiptResponse {
  data?: Record<string, ExpoPushReceipt> | ExpoPushReceipt[];
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

export interface ExpoReceiptStats {
  polled: number;
  ok: number;
  failed: number;
  tokensRemoved: number;
  markedChecked: number;
  error: string | null;
}

export interface ExpoReceiptCounters {
  enabled: boolean;
  lastPolledAt: string | null;
  polled: number;
  checked: number;
  tokensRemoved: number;
  errors: number;
  lastError: string | null;
}

const RECEIPT_POLL_INTERVAL_MS = 5 * 60_000;
const RECEIPT_FOLLOW_UP_MS = 2 * 60_000;
const RECEIPT_BATCH_SIZE = 300;

/**
 * Native Expo push fan-out for gateway-detected flight changes.
 *
 * Alerts are inserted for every subscriber first. Users with a native token
 * get an Expo push and their alert row is marked delivered so the web-push
 * loop does not duplicate it. Users without a native token keep an undelivered
 * alert for the existing web-push delivery path.
 *
 * Expo tickets are persisted and their asynchronous receipts are polled so
 * `DeviceNotRegistered` tokens are pruned even when the initial ticket is
 * accepted.
 */
export class ExpoPushService {
  private readonly receiptCounters = {
    polled: 0,
    checked: 0,
    tokensRemoved: 0,
    errors: 0,
  };
  private lastReceiptPollAt: string | null = null;
  private lastReceiptError: string | null = null;
  private receiptTimer: ReturnType<typeof setInterval> | null = null;
  private receiptTimeout: ReturnType<typeof setTimeout> | null = null;

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
      const receipts: ExpoPushReceiptInput[] = [];
      for (let index = 0; index < messages.length; index += 100) {
        const batch = messages.slice(index, index + 100);
        const result = await this.sendBatch(batch.map((entry) => entry.message));
        result.forEach((ticket, ticketIndex) => {
          const entry = batch[ticketIndex];
          if (!entry) return;
          if (ticket.status === "ok") {
            deliveredRowIds.add(entry.rowId);
            stats.pushesSent += 1;
            if (ticket.id) {
              receipts.push({
                ticketId: ticket.id,
                token: entry.message.to,
                alertId: entry.message.data.alertId,
              });
            }
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

      if (receipts.length > 0) {
        try {
          await this.supabase.insertExpoPushReceipts(receipts);
          // Receipts become available asynchronously; poll once shortly after
          // this fan-out and let the interval catch anything still pending.
          this.scheduleReceiptPoll();
        } catch (error) {
          this.log.warn({ err: error }, "expo receipt persistence failed");
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

  /**
   * Polls Expo's receipt endpoint for persisted tickets. DeviceNotRegistered
   * receipts prune the token; every returned receipt is marked checked so it
   * is polled once. Tickets not present in the response stay unchecked (Expo
   * may not have produced their receipt yet).
   */
  async pollReceipts(limit = RECEIPT_BATCH_SIZE): Promise<ExpoReceiptStats> {
    const stats: ExpoReceiptStats = {
      polled: 0,
      ok: 0,
      failed: 0,
      tokensRemoved: 0,
      markedChecked: 0,
      error: null,
    };
    if (!this.configured()) return stats;
    this.lastReceiptPollAt = new Date().toISOString();
    try {
      const rows = await this.supabase.listUncheckedExpoPushReceipts(limit);
      if (!rows.length) return stats;
      const byTicket = new Map(rows.map((row) => [row.ticket_id, row]));
      const ticketIds = [...byTicket.keys()];
      const receipts: Record<string, ExpoPushReceipt> = {};
      for (let index = 0; index < ticketIds.length; index += RECEIPT_BATCH_SIZE) {
        const chunk = ticketIds.slice(index, index + RECEIPT_BATCH_SIZE);
        Object.assign(receipts, await this.fetchReceipts(chunk));
      }

      const checked: string[] = [];
      for (const [ticketId, receipt] of Object.entries(receipts)) {
        const row = byTicket.get(ticketId);
        if (!row) continue;
        if (receipt.status === "ok") {
          checked.push(ticketId);
          stats.ok += 1;
          continue;
        }
        stats.failed += 1;
        if (receipt.details?.error === "DeviceNotRegistered") {
          try {
            await this.supabase.deleteDeviceToken(row.token);
            stats.tokensRemoved += 1;
            this.receiptCounters.tokensRemoved += 1;
            checked.push(ticketId);
          } catch (error) {
            // Keep the receipt unchecked so the next poll retries the prune.
            stats.error = error instanceof Error ? error.message : String(error);
            this.log.warn({ err: error }, "expo receipt token cleanup failed");
          }
        } else {
          checked.push(ticketId);
        }
      }

      if (checked.length > 0) {
        await this.supabase.markExpoPushReceiptsChecked(checked);
        stats.markedChecked = checked.length;
        this.receiptCounters.checked += checked.length;
      }
      stats.polled = checked.length;
      this.receiptCounters.polled += checked.length;
    } catch (error) {
      stats.error = error instanceof Error ? error.message : String(error);
      this.receiptCounters.errors += 1;
      this.lastReceiptError = stats.error;
      this.log.warn({ err: error }, "expo receipt poll failed");
    }
    return stats;
  }

  /** Receipt counters exposed by `/v1/status`. */
  receiptStats(): ExpoReceiptCounters {
    return {
      enabled: this.configured(),
      lastPolledAt: this.lastReceiptPollAt,
      polled: this.receiptCounters.polled,
      checked: this.receiptCounters.checked,
      tokensRemoved: this.receiptCounters.tokensRemoved,
      errors: this.receiptCounters.errors,
      lastError: this.lastReceiptError,
    };
  }

  /** Starts the background receipt loop (no-op without Supabase). */
  startReceiptPolling(intervalMs = RECEIPT_POLL_INTERVAL_MS): void {
    if (!this.configured() || this.receiptTimer) return;
    this.receiptTimer = setInterval(() => {
      void this.pollReceipts();
    }, intervalMs);
    this.receiptTimer.unref?.();
    // Do not wait a full interval for receipts from before a restart.
    this.scheduleReceiptPoll(30_000);
  }

  stopReceiptPolling(): void {
    if (this.receiptTimer) {
      clearInterval(this.receiptTimer);
      this.receiptTimer = null;
    }
    if (this.receiptTimeout) {
      clearTimeout(this.receiptTimeout);
      this.receiptTimeout = null;
    }
  }

  private scheduleReceiptPoll(delayMs = RECEIPT_FOLLOW_UP_MS): void {
    if (!this.configured() || this.receiptTimeout) return;
    this.receiptTimeout = setTimeout(() => {
      this.receiptTimeout = null;
      void this.pollReceipts();
    }, delayMs);
    this.receiptTimeout.unref?.();
  }

  private async fetchReceipts(
    ticketIds: string[],
  ): Promise<Record<string, ExpoPushReceipt>> {
    const response = await fetch(
      "https://exp.host/--/api/v2/push/getReceipts",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/json",
          ...(this.config.EXPO_ACCESS_TOKEN
            ? { Authorization: `Bearer ${this.config.EXPO_ACCESS_TOKEN}` }
            : {}),
        },
        body: JSON.stringify({ ids: ticketIds }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok) {
      throw new Error(`Expo receipts returned HTTP ${response.status}`);
    }
    const body = (await response
      .json()
      .catch(() => null)) as ExpoReceiptResponse | null;
    const data = body?.data;
    if (!data || Array.isArray(data)) return {};
    const receipts: Record<string, ExpoPushReceipt> = {};
    for (const [ticketId, receipt] of Object.entries(data)) {
      if (
        receipt &&
        typeof receipt === "object" &&
        (receipt.status === "ok" || receipt.status === "error")
      ) {
        receipts[ticketId] = receipt;
      }
    }
    return receipts;
  }
}
