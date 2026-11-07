import type { FastifyReply, FastifyRequest } from "fastify";
import type { UserQuotaService } from "./user-quota.js";

export function providerQuotaMessage(anonymous: boolean): string {
  return anonymous
    ? "You've used this hour's guest lookups. Sign in for your daily allowance and to sync your watchlist."
    : "You've used the live lookups included with your plan for today. Upgrade for a larger daily allowance.";
}

/**
 * Reserves the caller's quota for one provider call. Returns false and sends
 * a 429 when caller has no room. Returns true when there is no identity
 * attached (log mode) so the fleet-level budget still applies.
 */
export async function reserveProviderQuota(
  request: FastifyRequest,
  reply: FastifyReply,
  quota: UserQuotaService,
  units: number,
): Promise<boolean> {
  const uid = request.providerUid;
  if (!uid) return true;
  const anonymous = Boolean(request.providerAnonymous);
  const capacity = await quota.ensureCapacity(uid, anonymous, units);
  if (capacity.used + units > capacity.limit) {
    reply.code(429).send({
      error: "quota_exhausted",
      message: providerQuotaMessage(anonymous),
    });
    return false;
  }
  await quota.consume(uid, anonymous, units);
  return true;
}

/** Refunds reserved units when the provider did not charge for the call. */
export async function refundProviderQuota(
  request: FastifyRequest,
  quota: UserQuotaService,
  units: number,
): Promise<void> {
  if (!request.providerUid) return;
  await quota.refund(
    request.providerUid,
    Boolean(request.providerAnonymous),
    units,
  );
}
