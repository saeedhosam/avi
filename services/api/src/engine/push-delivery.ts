import webpush from "web-push";
import type { FastifyBaseLogger } from "fastify";
import type { AppConfig } from "../config.js";
import type { SupabaseServer } from "../lib/supabase-server.js";

export interface PushDeliveryStats {
  enabled: boolean;
  delivered: number;
  noSubscriberAlerts: number;
  staleRemoved: number;
  retriedLater: number;
  error: string | null;
}

/**
 * Web Push fan-out for engine-written flight alerts.
 *
 * Reads undelivered `flight_alerts` rows, sends them to every stored web-push
 * endpoint of the owning user, prunes endpoints the push service reports as
 * gone (404/410), and marks alerts delivered. An alert whose every endpoint
 * failed transiently stays undelivered and is retried next cycle; an alert
 * whose endpoints are all gone is marked delivered so it never retries.
 */
export class PushDelivery {
  constructor(
    private readonly config: AppConfig,
    private readonly supabase: SupabaseServer,
    private readonly log: FastifyBaseLogger,
  ) {}

  configured(): boolean {
    return Boolean(this.config.VAPID_PUBLIC_KEY && this.config.VAPID_PRIVATE_KEY);
  }

  async deliver(): Promise<PushDeliveryStats> {
    const stats: PushDeliveryStats = {
      enabled: this.configured(),
      delivered: 0,
      noSubscriberAlerts: 0,
      staleRemoved: 0,
      retriedLater: 0,
      error: null,
    };
    if (!stats.enabled || !this.config.PUSH_DELIVERY_ENABLED) return stats;

    try {
      webpush.setVapidDetails(
        this.config.VAPID_SUBJECT,
        this.config.VAPID_PUBLIC_KEY ?? "",
        this.config.VAPID_PRIVATE_KEY ?? "",
      );
      const alerts = await this.supabase.listUndeliveredAlerts(this.config.PUSH_BATCH_SIZE);
      if (!alerts.length) return stats;

      const subscriptions = await this.supabase.listSubscriptions([
        ...new Set(alerts.map((alert) => alert.user_id)),
      ]);
      const deliveredIds: string[] = [];

      for (const alert of alerts) {
        const endpoints = subscriptions.get(alert.user_id) ?? [];
        if (!endpoints.length) {
          stats.noSubscriberAlerts += 1;
          deliveredIds.push(alert.id);
          continue;
        }

        const payload = JSON.stringify({
          alertId: alert.id,
          title: `AeroQuest · ${alert.flight_number}`,
          body: alert.title,
          message: alert.message,
          tag: alert.id,
          url: `/flight/${alert.flight_number.replace(/\s+/g, "")}`,
        });

        let sent = false;
        let allStale = true;
        let transientFailure = false;

        for (const sub of endpoints) {
          try {
            await webpush.sendNotification(
              {
                endpoint: sub.endpoint,
                keys: { p256dh: sub.p256dh, auth: sub.auth },
              },
              payload,
            );
            sent = true;
            allStale = false;
          } catch (error) {
            const statusCode = (error as { statusCode?: number }).statusCode;
            if (statusCode === 404 || statusCode === 410) {
              try {
                await this.supabase.deleteSubscription(sub.endpoint);
                stats.staleRemoved += 1;
              } catch (deleteError) {
                this.log.warn({ err: deleteError }, "push subscription delete failed");
              }
            } else {
              allStale = false;
              transientFailure = true;
              this.log.debug({ err: error, alertId: alert.id }, "push send failed");
            }
          }
        }

        if (sent || allStale) {
          deliveredIds.push(alert.id);
          if (!sent) stats.noSubscriberAlerts += 1;
        } else if (transientFailure) {
          stats.retriedLater += 1;
        }
      }

      await this.supabase.markAlertsDelivered(deliveredIds);
      stats.error = null;
    } catch (error) {
      stats.error = error instanceof Error ? error.message : String(error);
      this.log.error({ err: error }, "push delivery cycle failed");
    }
    return stats;
  }
}
