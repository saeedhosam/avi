import type { Metadata } from "next";
import Link from "next/link";
import { Scale } from "lucide-react";
import { Panel } from "@/components/ui";

export const metadata: Metadata = {
  title: { absolute: "Terms of Service · Avi" },
};

const UPDATE = "November 11, 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-xs font-black uppercase tracking-[0.16em] text-accent">{title}</h2>
      <div className="mt-2 space-y-2 text-[13px] leading-relaxed text-muted">{children}</div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Panel className="p-6">
        <p className="label-caps flex items-center gap-2 text-accent">
          <Scale className="size-4" /> Legal
        </p>
        <h1 className="mt-2 text-xl font-black text-ink">Avi Terms of Service</h1>
        <p className="mt-1 text-[11px] text-subtle">Last updated: {UPDATE}</p>

        <Section title="1. The service">
          <p>
            Avi (&quot;Avi&quot;, &quot;we&quot;, &quot;us&quot;) is a consumer flight-tracking
            web application operated by <strong className="text-ink">Saeed Jumaa</strong> (Egypt)
            at <Link className="text-accent underline" href="/">avi.codestep.org</Link>. It shows live
            flight data, airport boards, route networks, terminal wayfinding, destination weather,
            and generates alerts for flights you watch.
          </p>
          <p>
            By creating an account or using Avi you agree to these Terms.
          </p>
        </Section>

        <Section title="2. Not for operational navigation">
          <p>
            Avi is an <strong className="text-ink">informational product only</strong>. It is not a
            certified navigation system, not an AMDB certified product, not an official source of
            flight information, and <strong className="text-ink">must not</strong> be used for flight
            operations, flight planning, or aircrew use. Always rely on your airline and official
            channels for operational decisions. Flight, gate, delay, and baggage data come from
            third parties and may be incomplete or inaccurate.
          </p>
          <p>
            Some content is explicitly <strong className="text-ink">reference or illustrative</strong>:
            the bundled airport catalog, indoor terminal layouts and walking estimates, and aircraft
            seat maps. They are not live measurements and must not be relied on for wayfinding, seat
            availability, or operational decisions.
          </p>
        </Section>

        <Section title="3. Accounts">
          <p>
            You need a Google account to sign in. You are responsible for keeping your Google
            account secure and for all activity under your Avi account. One person, one account;
            do not share it.
          </p>
          <p>
            You can delete your account and all associated data at any time from the Account
            dialog → Delete account &amp; data, or by emailing
            <a className="text-accent underline" href="mailto:makymaky757@gmail.com"> makymaky757@gmail.com</a>.
          </p>
        </Section>

        <Section title="4. Subscriptions and payments">
          <p>
            Avi offers optional paid plans: <strong className="text-ink">Avi Plus</strong>
            ($4.99/month, with an annual option) and <strong className="text-ink">Avi Pro</strong>
            ($9.99/month, with an annual option). Every plan includes unlimited saved flights;
            plans differ in how many flights can be <em>live-tracked</em> (refreshed by the
            Avi data engine) at the same time: Free 3, Plus 15, Pro 50.
          </p>
          <p>
            Subscriptions are sold by <strong className="text-ink">Polar Software, Inc.</strong> as
            Merchant of Record — Polar is the legal seller and processes payments, invoices, and
            customer taxes. When you subscribe you enter a purchase contract with Polar under
            its <a className="text-accent underline" href="https://polar.sh/legal/checkout-buyer-terms" target="_blank" rel="noreferrer">Checkout Buyer Terms</a>,
            and your use of Avi is licensed to you under these Terms. You authorize recurring
            charges until you cancel.
          </p>
          <p><strong className="text-ink">Cancellation and renewals:</strong>
            You can cancel at any time from your Polar customer portal or by contacting us; access
            to paid features continues until the end of the paid period, then your account returns
            to the Free plan. Prices may change with notice before your next renewal.</p>
          <p><strong className="text-ink">Refunds:</strong>
            LOG handled by Polar under its purchaser terms; contact us and we&apos;ll help route it.</p>
        </Section>

        <Section title="5. What you may not do">
          <p>You may not:</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>scrape, bulk-extract, or redistribute Avi&apos;s data (flight data, routes, weather) — the app is an end-use product for viewing, not a data source;</li>
            <li>resell or sublicense access to Avi or use it to build a competing data service;</li>
            <li>interfere with the service, bypass rate limits or plan limits, or attempt to access other users&apos; data;</li>
            <li>use Avi for unlawful purposes, or to infringe anyone&apos;s rights.</li>
          </ul>
          <p>
            Automated data extraction through any automated means is prohibited and may result in
            immediate termination.
          </p>
        </Section>

        <Section title="6. Data and privacy">
          <p>
            Our handling of your personal data is described in the{" "}
            <Link className="text-accent underline" href="/legal/privacy">Privacy Policy</Link>.
            Cached flight data is stored no longer than the provider terms permit (7 days) and is
            automatically purged. Browser-local records that predate retrieval timestamps are kept
            only on your device, labelled &quot;age unknown&quot;, and are never shown as fresh; you can
            clear them at any time through your browser&apos;s site-data settings.
          </p>
        </Section>

        <Section title="7. Third-party data sources">
          <p>
            Avi displays data from third parties — flight data by AeroDataBox, weather by
            Open-Meteo (CC-BY 4.0), maps and tiles © <strong className="text-ink">OpenStreetMap</strong>
            contributors (ODbL), served via OpenFreeMap, with MapLibre. Their respective terms apply
            to their portions of the service; those providers are not ourselves responsible to you
            for their data.
          </p>
        </Section>

        <Section title="8. Availability and changes">
          <p>
            Avi is provided &quot;as is&quot; and &quot;as available&quot;. We may add, change, or
            remove features at any time, including live data limits and provider coverage, and we
            may suspend the service for maintenance. Live data is subject to third-party coverage
            limits and periodic budget-based pauses (announced in-app).
          </p>
        </Section>

        <Section title="9. Limitation of liability">
          <p>
            To the maximum extent permitted by law, Avi and its operator are not liable for
            indirect, incidental, or consequential damages, or for missed flights, missed
            connections, or any loss arising from reliance on Avi&apos;s data. Where liability
            cannot be excluded, it is limited to the greater of the amount you paid Avi in the
            12 months before the claim, or USD 50. Nothing excludes liability for gross
            negligence or willful misconduct to the extent prohibited by law.
          </p>
        </Section>

        <Section title="10. Termination">
          <p>
            You may stop using Avi at any time. We may suspend or terminate accounts that breach
            these Terms (in particular section 5) with notice to the account email, or for an
            extended service outage. On termination, section 6 retention rules apply.
          </p>
        </Section>

        <Section title="11. Governing law">
          <p>
            These Terms are governed by the laws of the Arab Republic of Egypt, without regard to
            conflict-of-law rules. Disputes will be resolved in the courts of Egypt.
          </p>
          <p className="text-subtle">
            If any provision of these Terms is unenforceable, the rest stays in force.
          </p>
        </Section>

        <Section title="12. Contact">
          <p>Saeed Jumaa — <a className="text-accent underline" href="mailto:makymaky757@gmail.com">makymaky757@gmail.com</a></p>
          <p className="mt-4">
            <Link className="text-accent underline" href="/legal/privacy">Avi Privacy Policy →</Link>
          </p>
        </Section>
      </Panel>
    </div>
  );
}
