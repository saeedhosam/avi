import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Panel } from "@/components/ui";

export const metadata: Metadata = {
  title: { absolute: "Privacy Policy · AeroQuest" },
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

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Panel className="p-6">
        <p className="label-caps flex items-center gap-2 text-accent">
          <ShieldCheck className="size-4" /> Legal
        </p>
        <h1 className="mt-2 text-xl font-black text-ink">AeroQuest Privacy Policy</h1>
        <p className="mt-1 text-[11px] text-subtle">Last updated: {UPDATE}</p>

        <Section title="1. Who we are">
          <p>
            AeroQuest (&quot;AeroQuest&quot;, &quot;we&quot;, &quot;us&quot;) is a live flight-tracking
            service operated by <strong className="text-ink">Saeed Jumaa</strong>, an
            individual based in <strong className="text-ink">Egypt</strong>. You can reach
            us at <a className="text-accent underline" href="mailto:makymaky757@gmail.com">makymaky757@gmail.com</a>.
          </p>
          <p>
            This policy describes the personal data AeroQuest collects, why, how long it is
            kept, and your rights. It applies to the web application at{" "}
            <Link className="text-accent underline" href="/">avi.codestep.org</Link> and its
            companion clients.
          </p>
        </Section>

        <Section title="2. What we collect">
          <p><strong className="text-ink">Account data</strong> — when you sign in with Google through Supabase,
            your Google account&apos;s name, email address, and profile photo URL.
        Required to create and operate your account.</p>
          <p><strong className="text-ink">Watchlist &amp; notes</strong> — the flights you save, your personal
            notes, and a cached snapshot of each flight&apos;s status at the time of saving.
            Provided by you; used to sync your watchlist across devices.</p>
          <p><strong className="text-ink">Alerts</strong> — records of flight changes (gate, delay, boarding,
            cancellation, baggage) generated for your watched flights.</p>
          <p><strong className="text-ink">Push subscriptions</strong> — if you enable browser push, the
            browser-generated subscription endpoint and cryptographic keys (no personal data).</p>
          <p><strong className="text-ink">Device-local data</strong> — your watchlist cache and recent
            searches are also stored in your browser&apos;s local storage on your device.
            It never leaves your device beyond the cloud sync described above.</p>
          <p><strong className="text-ink">Reference and illustrative content</strong> — the bundled
            airport catalog, terminal layouts, and seat maps are reference material shipped with the
            app. They are not live measurements, are not attributed to you, and are not used for
            profiling.</p>
          <p><strong className="text-ink">Payment data</strong> — handled entirely by Polar Software, Inc.
            (our Merchant of Record). AeroQuest does not receive or store card numbers or payment details.</p>
        </Section>

        <Section title="3. What we do NOT collect">
          <p>
            No advertising or ad-tracking. No analytics trackers. No behavioral profiling.
            No cookies are used for tracking; your preferences live only in your device&apos;s
            local storage. We do not sell your data — ever.
          </p>
        </Section>

        <Section title="4. Why we process it (legal bases)">
          <p>Performance of the service / contract:</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>creating your account and syncing your data across devices</li>
            <li>generating alerts for flights you watch</li>
            <li>delivering push notifications you opted in to</li>
            <li>processing payments and billing (through Polar)</li>
          </ul>
          <p>Legitimate interest — keeping the service secure, preventing abuse, debugging failures.</p>
          <p>Consent — enabling optional browser notifications on your device.</p>
        </Section>

        <Section title="5. Who processes your data">
          <p><strong className="text-ink">Supabase</strong> — account storage, database, and authentication
            (hosted in the EU, Ireland region). See
            supabase.com/privacy.</p>
          <p><strong className="text-ink">Polar Software, Inc.</strong> — Merchant of Record for subscription
            payments; they hold your payment details and issue invoices as the legal seller.
            Polar&apos;s buyer terms apply to your purchase: <a className="text-accent underline" href="https://polar.sh/legal/checkout-buyer-terms" target="_blank" rel="noreferrer">polar.sh/legal/checkout-buyer-terms</a>.</p>
          <p><strong className="text-ink">Google</strong> — sign-in identity (subject to Google&apos;s privacy policy).</p>
          <p><strong className="text-ink">AeroDataBox</strong> — flight-data provider. We send only the flight
            number or airport code you look up.</p>
          <p><strong className="text-ink">Open-Meteo (OpenMeteo GmbH, Switzerland)</strong> — weather lookups, by airport coordinates.</p>
          <p><strong className="text-ink">OpenFreeMap / OpenStreetMap Foundation</strong> — map tiles;
            requests are made when you view a map, without cookies, and are not attributed to you by us.</p>
        </Section>

        <Section title="6. Retention">
          <ul className="ml-4 list-disc space-y-1">
            <li>Account, watchlist, and alert data: kept while your account is active. You can delete everything yourself at any time from Account → Delete account &amp; data, or by emailing us.</li>
            <li>Cached flight snapshots: automatically purged after <strong className="text-ink">7 days</strong> (see Terms), refreshed whenever the live data engine updates a watched flight. Browser-local cached records created before retrieval timestamps were introduced are kept only on your device, are labelled &quot;age unknown&quot;, and are never presented as fresh. Clear your browser&apos;s site data to remove them immediately.</li>
            <li>Server log files: short-lived and never linked to your account.</li>
          </ul>
        </Section>

        <Section title="7. Your rights">
          <p>
            You can access, export, correct, or delete your data at any time:
          </p>
          <ul className="ml-4 list-disc space-y-1">
            <li><strong className="text-ink">Delete everything now:</strong> Account dialog → Delete account &amp; data. Your profile, watchlist, notes, alerts, and push settings are erased immediately and irreversibly.</li>
            <li><strong className="text-ink">Access/export:</strong> everything visible in the app is yours; or email us.</li>
            <li><strong className="text-ink">Withdraw consent:</strong> turn off push notifications or delete your account.</li>
          </ul>
          <p>
            We honor these rights as far as applicable under Egypt&apos;s Personal Data
            Protection Law No. 151 of 2020 and, where applicable, the EU GDPR, for as
            long as your account is hosted in the EU region.
          </p>
        </Section>

        <Section title="8. Security">
          <p>
            Data is stored with Supabase using row-level security so each account can only
            read its own rows, over HTTPS, in an EU-hosted database.
            Provider credentials are server-side only. No keys or secrets ship in any client.
          </p>
        </Section>

        <Section title="9. Changes">
          <p>
            This policy may be updated as the service evolves. Material changes will be
            announced in-app. The current version is always at this URL.
          </p>
        </Section>

        <Section title="10. Contact">
          <p>Saeed Jumaa — <a className="text-accent underline" href="mailto:makymaky757@gmail.com">makymaky757@gmail.com</a></p>
          <p className="mt-4">
            <Link className="text-accent underline" href="/legal/terms">AeroQuest Terms of Service →</Link>
          </p>
        </Section>
      </Panel>
    </div>
  );
}
