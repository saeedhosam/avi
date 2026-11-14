"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  BadgeCheck,
  Check,
  CreditCard,
  Loader2,
  ShieldCheck,
  Sparkles,
  Ticket,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { useApp, type AccountUsage } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui";

type CheckoutTarget = "PLUS" | "PRO" | "TRIP_PASS";

type Feedback = { kind: "info" | "error" | "success"; message: string };

const FREE_FEATURES = [
  "Direct-route explorer with arrival weather",
  "Basic flight lookup and airport boards",
  "2D terminal maps and wayfinding",
  "Unlimited saved flights and notes",
  "3 concurrently live-tracked flight-days",
];

const PRO_FEATURES = [
  "Everything in Free",
  "Live gate, terminal, status, and baggage alerts",
  "3D Cabin & Seat Twin",
  "Sprint Mode terminal routing",
  "Offline in-flight HUD",
  "Terminal fog-of-war passport",
  "AR carry-on bag sizer",
  "50 concurrently live-tracked flight-days",
];

const TRIP_PASS_FEATURES = [
  "Live gate, terminal, status, and baggage alerts",
  "3D Cabin & Seat Twin",
  "Sprint Mode terminal routing",
  "Offline in-flight HUD",
  "AR carry-on bag sizer",
  "One-time payment for a single trip",
];

export function PricingContent() {
  const {
    account,
    accountUsage,
    refreshUsage,
    signIn,
    authBusy,
  } = useApp();
  const [checkingBilling, setCheckingBilling] = useState(false);
  const [busy, setBusy] = useState<CheckoutTarget | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const checkBilling = useCallback(() => {
    if (!account.isSignedIn) {
      setCheckingBilling(false);
      return;
    }
    setCheckingBilling(true);
    void refreshUsage().finally(() => setCheckingBilling(false));
  }, [account.isSignedIn, refreshUsage]);

  useEffect(() => {
    checkBilling();
  }, [checkBilling]);

  // Checkout is only offered after the gateway explicitly reports that a
  // billing provider is configured. A missing or manual provider stays
  // read-only: we never start a checkout that cannot complete.
  const billingReady = accountUsage?.billing.upgradeEnabled === true;
  // Subscriptions require the gateway to report a configured billing
  // provider. The trip pass has its own hosted-checkout seam on the gateway,
  // so it is allowed to answer for itself (including a graceful 503).
  const planDisabled =
    busy !== null ||
    checkingBilling ||
    (account.isSignedIn && !billingReady);
  const tripPassDisabled = busy !== null;
  const proIsCurrent = accountUsage?.plan === "PRO";
  const plusIsCurrent =
    accountUsage?.plan === "PLUS" || accountUsage?.plan === "PRO";
  const tripPassActive = accountUsage?.tripPass?.active === true;

  const checkoutLabel = (
    target: CheckoutTarget,
    name: string,
    ready: boolean,
  ) => {
    if (!account.isSignedIn) return "Sign in to choose";
    if (checkingBilling) return "Checking availability…";
    if (!ready) return "Checkout unavailable";
    if (busy === target) return "Opening checkout…";
    return name;
  };

  const planLabel = (target: CheckoutTarget, name: string) =>
    checkoutLabel(target, name, billingReady);

  const plusLabel = !account.isSignedIn
    ? "AeroQuest Plus — $4.99/month · 15 concurrent live flights"
    : planLabel(
        "PLUS",
        "Prefer AeroQuest Plus? $4.99/month · 15 concurrent live flights",
      );

  const startCheckout = async (target: CheckoutTarget) => {
    if (!account.isSignedIn) {
      setFeedback({
        kind: "info",
        message:
          "Sign in with Google to start a secure checkout. The free route explorer and cabin preview work without an account.",
      });
      void signIn();
      return;
    }
    const subscriptionTarget = target === "PLUS" || target === "PRO";
    if (subscriptionTarget && checkingBilling) {
      setFeedback({
        kind: "info",
        message:
          "Subscription billing availability is still loading. Try again in a moment.",
      });
      return;
    }
    if (subscriptionTarget && !accountUsage) {
      setFeedback({
        kind: "info",
        message:
          "Subscription billing availability could not be confirmed. No checkout has started. Retry when the gateway is reachable.",
      });
      return;
    }
    if (subscriptionTarget && !billingReady) {
      setFeedback({
        kind: "info",
        message: `Subscription checkout is not configured in this build (billing provider: ${accountUsage?.billing.provider ?? "unknown"}). No purchase can start here.`,
      });
      return;
    }
    if (target === "PRO" && proIsCurrent) {
      setFeedback({
        kind: "info",
        message: "AeroQuest Pro is already active on this account.",
      });
      return;
    }
    if (target === "PLUS" && plusIsCurrent) {
      setFeedback({
        kind: "info",
        message: "AeroQuest Plus or Pro is already active on this account.",
      });
      return;
    }
    if (target === "TRIP_PASS" && tripPassActive) {
      setFeedback({
        kind: "info",
        message: "A Single-Trip Pass is already active on this account.",
      });
      return;
    }

    setBusy(target);
    setFeedback(null);
    try {
      const supabase = getSupabase();
      const session = supabase
        ? (await supabase.auth.getSession()).data.session
        : null;
      const accessToken = session?.access_token;
      if (!accessToken) {
        setFeedback({
          kind: "error",
          message:
            "Your session expired. Sign out and sign in again before starting checkout.",
        });
        return;
      }

      const endpoint =
        target === "TRIP_PASS"
          ? "/api/billing/trip-pass"
          : "/api/billing/checkout";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          target === "TRIP_PASS"
            ? { accessToken }
            : { accessToken, target },
        ),
      });
      const payload = (await response.json().catch(() => null)) as {
        url?: string;
        message?: string;
        error?: string;
      } | null;

      if (response.ok && payload?.url) {
        setFeedback({
          kind: "success",
          message: "Opening the secure hosted checkout…",
        });
        window.location.assign(payload.url);
        return;
      }

      if (response.status === 400 || response.status === 401) {
        setFeedback({
          kind: "error",
          message:
            payload?.message ??
            "Sign in again to continue checkout. Nothing was charged.",
        });
        return;
      }

      if (response.status === 503) {
        setFeedback({
          kind: "info",
          message:
            payload?.message ??
            "Checkout is not available right now. Nothing was charged.",
        });
        return;
      }

      setFeedback({
        kind: "error",
        message:
          payload?.message ??
          `Checkout failed (HTTP ${response.status}). Nothing was charged.`,
      });
    } catch {
      setFeedback({
        kind: "error",
        message:
          "Checkout could not be reached. Nothing was charged. Check your connection and try again.",
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <header className="mb-6">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-accent">
          <CreditCard className="size-3.5" />
          Plans &amp; trip pass
        </div>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-ink lg:text-5xl">
          Pay for the trip, not the browsing
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
          The route explorer, flight lookup, 2D terminal maps, and 3D cabin
          preview stay free. Choose Pro for year-round live travel tools, or a
          one-time $4.99 Single-Trip Pass when you only need them for one trip.
        </p>
      </header>

      <BillingState
        signedIn={account.isSignedIn}
        checking={checkingBilling}
        usage={accountUsage}
        authBusy={authBusy}
        onSignIn={() => void signIn()}
        onRetry={checkBilling}
      />

      {feedback ? (
        <div
          role="status"
          className={cn(
            "mt-3 rounded-2xl border px-4 py-3 text-xs leading-relaxed",
            feedback.kind === "error"
              ? "border-cancelled/45 bg-cancelled/10 text-ink"
              : feedback.kind === "success"
                ? "border-landed/45 bg-landed/10 text-ink"
                : "border-accent/40 bg-accent-soft text-ink",
          )}
        >
          {feedback.message}
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <PlanCard
          icon={<ShieldCheck className="size-4" />}
          name="AeroQuest Free"
          price="$0"
          cadence="forever"
          description="Everything you need to research a route before you book."
          features={FREE_FEATURES}
          cta={
            <Link
              href="/explore/CAI"
              className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-line bg-surface-2 text-sm font-semibold text-ink transition-colors hover:border-accent/50 hover:text-accent"
            >
              Start exploring
            </Link>
          }
        />

        <PlanCard
          icon={<Sparkles className="size-4" />}
          name="AeroQuest Pro"
          price="$9.99"
          cadence="/month"
          description="For frequent flyers who want live alerts and every travel tool."
          features={PRO_FEATURES}
          featured
          cta={
            <div className="space-y-2">
              <Button
                className="w-full"
                disabled={planDisabled || proIsCurrent}
                onClick={() => void startCheckout("PRO")}
              >
                {busy === "PRO" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <BadgeCheck className="size-4" />
                )}
                {proIsCurrent ? "Current plan" : planLabel("PRO", "Upgrade to Pro")}
              </Button>
              <button
                type="button"
                disabled={planDisabled || plusIsCurrent}
                onClick={() => void startCheckout("PLUS")}
                className="w-full text-center text-[10px] font-semibold leading-relaxed text-muted underline-offset-2 hover:text-accent hover:underline disabled:cursor-not-allowed disabled:opacity-50"
              >
                {plusIsCurrent ? "Included in your plan" : plusLabel}
              </button>
            </div>
          }
        />

        <PlanCard
          icon={<Ticket className="size-4" />}
          name="$4.99 Single-Trip Pass"
          price="$4.99"
          cadence="one-time"
          description="One payment unlocks the Pro travel features for a single trip."
          features={TRIP_PASS_FEATURES}
          cta={
            <>
              <Button
                className="w-full"
                variant="outline"
                disabled={tripPassDisabled || tripPassActive}
                onClick={() => void startCheckout("TRIP_PASS")}
              >
                {busy === "TRIP_PASS" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Ticket className="size-4" />
                )}
                {tripPassActive
                  ? "Single-Trip Pass active"
                  : !account.isSignedIn
                    ? "Sign in to choose"
                    : busy === "TRIP_PASS"
                      ? "Opening checkout…"
                      : "Buy Single-Trip Pass"}
              </Button>
              <p className="mt-2 text-center text-[9px] leading-relaxed text-subtle">
                Trip-pass availability is confirmed by the gateway at checkout.
                If it isn&apos;t configured, nothing is charged. The trip pass
                is separate from the Plus/Pro subscription provider.
              </p>
            </>
          }
        />
      </div>

      <div className="mt-5 space-y-2 rounded-2xl border border-line/80 bg-surface p-4 text-[10px] leading-relaxed text-subtle">
        <p>
          Prices are in USD. Subscriptions renew monthly until cancelled; the
          Single-Trip Pass is a one-time purchase. Tax and final currency are
          shown by the hosted checkout before payment.
        </p>
        <p>
          AeroQuest never stores card data. The hosted billing provider
          processes payment and the gateway verifies the receipt before a plan
          or pass is granted. Free features remain available whether or not
          checkout is configured.
        </p>
      </div>
    </>
  );
}

function BillingState({
  signedIn,
  checking,
  usage,
  authBusy,
  onSignIn,
  onRetry,
}: {
  signedIn: boolean;
  checking: boolean;
  usage: AccountUsage | null;
  authBusy: boolean;
  onSignIn: () => void;
  onRetry: () => void;
}) {
  if (!signedIn) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2.5">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" />
          <p className="text-xs leading-relaxed text-muted">
            Sign in with Google before buying a plan or trip pass. Browsing the
            route explorer and cabin preview stays free without an account.
          </p>
        </div>
        <Button size="sm" onClick={onSignIn} disabled={authBusy}>
          {authBusy ? "Connecting…" : "Sign in"}
        </Button>
      </div>
    );
  }

  if (checking) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface p-4 text-xs text-muted">
        <Loader2 className="size-4 animate-spin text-accent" />
        Checking billing availability with the gateway…
      </div>
    );
  }

  if (usage?.billing.upgradeEnabled) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-landed/35 bg-landed/10 p-4 text-xs text-ink">
        <BadgeCheck className="size-4 text-landed" />
        <span className="font-semibold">Subscription checkout is configured.</span>
        <span className="text-muted">
          Current plan: <strong className="text-ink">{usage.plan}</strong>
          {usage.tripPass?.active && usage.tripPass.expiresAt
            ? ` · Single-Trip Pass active until ${new Date(usage.tripPass.expiresAt).toLocaleString()}`
            : ""}
        </span>
      </div>
    );
  }

  if (usage) {
    return (
      <div className="rounded-2xl border border-delayed/35 bg-delayed/10 p-4 text-xs leading-relaxed text-ink">
        <p className="font-semibold">
          Subscription checkout is not configured in this build.
        </p>
        <p className="mt-1 text-muted">
          The billing provider is <strong className="text-ink">{usage.billing.provider}</strong>,
          so Plus and Pro are assigned manually today. The Single-Trip Pass uses
          its own hosted checkout and reports whether it is available when you
          continue.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-delayed/35 bg-delayed/10 p-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs leading-relaxed text-ink">
        Subscription billing availability could not be confirmed from the
        gateway. The Single-Trip Pass checkout reports its own availability
        when you continue.
      </p>
      <Button size="sm" variant="outline" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

function PlanCard({
  icon,
  name,
  price,
  cadence,
  description,
  features,
  cta,
  featured = false,
}: {
  icon: React.ReactNode;
  name: string;
  price: string;
  cadence: string;
  description: string;
  features: string[];
  cta: React.ReactNode;
  featured?: boolean;
}) {
  return (
    <section
      className={cn(
        "flex flex-col rounded-3xl border p-5",
        featured
          ? "border-accent/50 bg-accent-soft shadow-[0_20px_60px_-35px_rgba(0,229,255,0.55)]"
          : "border-line bg-surface",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex size-8 items-center justify-center rounded-xl border",
            featured
              ? "border-accent/50 bg-accent/10 text-accent"
              : "border-line bg-surface-2 text-muted",
          )}
        >
          {icon}
        </span>
        <h2 className="text-sm font-black text-ink">{name}</h2>
        {featured ? (
          <span className="ml-auto rounded-full bg-accent px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-[color:var(--bg)]">
            Most popular
          </span>
        ) : null}
      </div>

      <p className="mt-4 flex items-baseline gap-1">
        <span className="text-4xl font-black tracking-tight text-ink">
          {price}
        </span>
        <span className="text-xs font-semibold text-muted">{cadence}</span>
      </p>
      <p className="mt-2 min-h-10 text-[11px] leading-relaxed text-muted">
        {description}
      </p>

      <ul className="mt-4 flex-1 space-y-2">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-[11px] text-muted">
            <Check
              className={cn(
                "mt-0.5 size-3.5 shrink-0",
                featured ? "text-accent" : "text-landed",
              )}
            />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <div className="mt-5">{cta}</div>
    </section>
  );
}
