import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "Not found · Avi" },
};

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl items-center px-4">
      <div className="w-full rounded-2xl border border-line bg-surface/90 p-8 text-center">
        <p className="label-caps text-accent">Off the flight plan</p>
        <h1 className="mt-2 text-xl font-black text-ink">We couldn&apos;t find that page</h1>
        <p className="mt-1 text-xs text-muted">
          The link may point to a flight or destination that is not available.
          Your watchlist and saved data are untouched.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <Link
            href="/search"
            className="inline-flex h-9 items-center rounded-lg bg-accent px-4 text-xs font-bold text-[color:var(--bg)]"
          >
            Go to search
          </Link>
          <Link
            href="/"
            className="inline-flex h-9 items-center rounded-lg border border-line px-4 text-xs font-bold text-ink"
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
