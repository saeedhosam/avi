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
    <section className="rounded-3xl border border-accent/35 bg-accent-soft p-4">
      <div className="flex items-start gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-accent/45 bg-accent/10 text-accent">
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-accent">
            AeroQuest Pro · Single-Trip Pass
          </p>
          <p className="mt-1 text-sm font-bold text-ink">{title}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">{body}</p>
          <Link
            href="/pricing"
            className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-accent hover:underline"
          >
            Compare plans <ArrowUpRight className="size-3" />
          </Link>
          <p className="mt-1.5 text-[9px] leading-relaxed text-subtle">
            Free previews and the route explorer stay free.
          </p>
        </div>
      </div>
    </section>
  );
}
