import Link from "next/link";
import { ArrowUpRight, Sparkles } from "lucide-react";

/**
 * Compact, non-blocking upgrade hook used by the free explorer and cabin
 * preview. It only links to `/pricing`; it never starts a purchase and never
 * hides the free content behind it.
 */
export function UpgradeCta({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <section className="rounded-xl border border-accent/25 bg-accent-soft p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-accent/30 bg-accent/10 text-accent">
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="label-caps text-accent">AeroQuest Pro · Single-Trip Pass</p>
          <p className="mt-1 text-[13px] font-medium text-ink">{title}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">{body}</p>
          <Link
            href="/pricing"
            className="mt-2.5 inline-flex items-center gap-1 text-xs font-semibold text-accent transition-colors hover:text-ink"
          >
            Compare plans <ArrowUpRight className="size-3.5" />
          </Link>
          <p className="mt-1.5 text-xs leading-relaxed text-subtle">
            Free previews and the route explorer stay free.
          </p>
        </div>
      </div>
    </section>
  );
}
