import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyBaseLogger } from "fastify";
import type { Flight, FlightAlert } from "@avi/shared";
import { loadConfig } from "../src/config.js";
import type {
  ExpoPushReceiptInput,
  SupabaseServer,
} from "../src/lib/supabase-server.js";
import { ExpoPushService } from "../src/gateway/expo-push.js";

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as unknown as FastifyBaseLogger;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Expo push receipts", () => {
  it("marks checked receipts and prunes DeviceNotRegistered tokens", async () => {
    const markChecked = vi.fn().mockResolvedValue(undefined);
    const deleteToken = vi.fn().mockResolvedValue(undefined);
    const supabase = {
      ready: true,
      listUncheckedExpoPushReceipts: vi.fn().mockResolvedValue([
        {
          ticket_id: "ticket-ok",
          token: "ExponentPushToken[ok]",
          alert_id: "alert-1",
          created_at: "2026-11-14T10:00:00.000Z",
        },
        {
          ticket_id: "ticket-dead",
          token: "ExponentPushToken[dead]",
          alert_id: "alert-2",
          created_at: "2026-11-14T10:00:01.000Z",
        },
      ]),
      markExpoPushReceiptsChecked: markChecked,
      deleteDeviceToken: deleteToken,
    } as unknown as SupabaseServer;
    const receiptRequest = vi.fn(async (_input: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { ids: string[] };
      expect(body.ids).toEqual(["ticket-ok", "ticket-dead"]);
      return json({
        data: {
          "ticket-ok": { status: "ok" },
          "ticket-dead": {
            status: "error",
            message: "Device is not registered",
            details: { error: "DeviceNotRegistered" },
          },
        },
      });
    });
    vi.stubGlobal("fetch", receiptRequest);

    const service = new ExpoPushService(
      loadConfig({ NODE_ENV: "test" }),
      supabase,
      logger,
    );
    const stats = await service.pollReceipts();

    expect(String(receiptRequest.mock.calls[0]?.[0])).toContain(
      "/--/api/v2/push/getReceipts",
    );
    expect(deleteToken).toHaveBeenCalledWith("ExponentPushToken[dead]");
    expect(deleteToken).not.toHaveBeenCalledWith("ExponentPushToken[ok]");
    expect(markChecked).toHaveBeenCalledWith(["ticket-ok", "ticket-dead"]);
    expect(stats).toMatchObject({
      polled: 2,
      ok: 1,
      failed: 1,
      tokensRemoved: 1,
      markedChecked: 2,
      error: null,
    });
    expect(service.receiptStats()).toMatchObject({
      enabled: true,
      polled: 2,
      checked: 2,
      tokensRemoved: 1,
      errors: 0,
    });
  });

  it("leaves receipts unchecked when the receipt endpoint fails", async () => {
    const markChecked = vi.fn().mockResolvedValue(undefined);
    const supabase = {
      ready: true,
      listUncheckedExpoPushReceipts: vi.fn().mockResolvedValue([
        {
          ticket_id: "ticket-1",
          token: "ExponentPushToken[abc]",
          alert_id: null,
          created_at: "2026-11-14T10:00:00.000Z",
        },
      ]),
      markExpoPushReceiptsChecked: markChecked,
      deleteDeviceToken: vi.fn(),
    } as unknown as SupabaseServer;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("upstream error", { status: 500 })),
    );

    const service = new ExpoPushService(
      loadConfig({ NODE_ENV: "test" }),
      supabase,
      logger,
    );
    const stats = await service.pollReceipts();

    expect(stats.error).toContain("HTTP 500");
    expect(markChecked).not.toHaveBeenCalled();
    expect(service.receiptStats()).toMatchObject({
      enabled: true,
      errors: 1,
      lastError: expect.stringContaining("HTTP 500"),
    });
  });

  it("persists ticket ids after a successful fan-out", async () => {
    const insertReceipts = vi.fn(
      async (_receipts: ExpoPushReceiptInput[]) => undefined,
    );
    const supabase = {
      ready: true,
      listFlightSubscriberIds: vi.fn().mockResolvedValue(["user-1"]),
      listExpoTokens: vi.fn().mockResolvedValue([
        {
          user_id: "user-1",
          platform: "ios",
          token: "ExponentPushToken[abc]",
        },
      ]),
      insertAlerts: vi.fn().mockResolvedValue(undefined),
      markAlertsDelivered: vi.fn().mockResolvedValue(undefined),
      insertExpoPushReceipts: insertReceipts,
    } as unknown as SupabaseServer;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({ data: [{ status: "ok", id: "ticket-123" }] }),
      ),
    );

    const service = new ExpoPushService(
      loadConfig({ NODE_ENV: "test" }),
      supabase,
      logger,
    );
    const flight = {
      flightNumber: "AQ 100",
      flightDate: "2026-12-01",
    } as Flight;
    const alerts: FlightAlert[] = [
      {
        id: "alert-1",
        flightNumber: "AQ 100",
        flightDate: "2026-12-01",
        type: "GATE_CHANGE",
        title: "Gate changed",
        message: "Gate B14",
        timestamp: "2026-12-01T10:00:00.000Z",
        isRead: false,
      },
    ];
    try {
      const stats = await service.notifyFlightChanges(flight, alerts);
      expect(stats.pushesSent).toBe(1);
      expect(stats.error).toBeNull();
      expect(insertReceipts).toHaveBeenCalledTimes(1);
      expect(insertReceipts.mock.calls[0]?.[0]).toEqual([
        {
          ticketId: "ticket-123",
          token: "ExponentPushToken[abc]",
          alertId: expect.any(String),
        },
      ]);
    } finally {
      service.stopReceiptPolling();
    }
  });
});
