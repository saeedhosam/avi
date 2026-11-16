import Link from "next/link";
import type { Metadata } from "next";
import { Plane } from "lucide-react";

export const metadata: Metadata = {
  title: { absolute: "Not found · Avi" },
};

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg items-center px-4 py-12">
      <div className="w-full rounded-xl border border-line/70 bg-surface/80 p-8 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full border border-line/70 bg-surface-2 text-subtle">
          <Plane className="size-5" />
        </div>
        <p className="label-caps mt-4 text-accent">Off the flight plan</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-ink">
          We couldn&apos;t find that page
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          The link may point to a destination that is not available. Your saved
          data is untouched.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Link
            href="/explore/CAI"
            className="inline-flex min-h-10 items-center rounded-lg bg-accent px-4 text-[13px] font-semibold text-[color:var(--bg)]"
          >
            Explore routes
          </Link>
        </div>
      </div>
    </div>
  );
}
