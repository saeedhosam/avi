/**
 * Map-shaped fallback for the direct-route globe. It keeps the same header and
 * detail-card geometry as the real map so the Suspense boundary does not flash
 * a bare text page.
 */
export function ExploreGlobeSkeleton() {
  return (
    <div
      className="explore-map relative h-full w-full overflow-hidden bg-surface"
      aria-busy="true"
    >
      <span className="sr-only">Loading the direct-route globe</span>

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,#0E2233_0%,#07111A_46%,#070B11_100%)]" />
      <div className="absolute left-1/2 top-1/2 size-[min(68vw,34rem)] -translate-x-1/2 -translate-y-1/2 rounded-full border border-line/30 bg-surface/10">
        <div className="absolute inset-[12%] rounded-full border border-line/20" />
        <div className="absolute inset-[30%] rounded-full border border-line/10" />
        <div className="absolute left-[22%] top-[38%] size-2 rounded-full bg-accent/60" />
        <div className="absolute left-[58%] top-[28%] size-1.5 rounded-full bg-accent/40" />
        <div className="absolute left-[64%] top-[58%] size-1.5 rounded-full bg-accent/50" />
        <div className="absolute left-[36%] top-[68%] size-1.5 rounded-full bg-accent/30" />
      </div>

      <div className="map-overlay-top absolute left-3 right-3 rounded-xl border border-line/70 bg-surface/90 p-4 shadow-2xl backdrop-blur-xl sm:left-4 sm:right-4 lg:right-auto lg:w-[min(30rem,calc(100%_-_26rem))]">
        <div className="flex items-center gap-2">
          <div className="h-3.5 w-3.5 rounded-full bg-accent/30" />
          <div className="h-3 w-32 rounded bg-line/70" />
          <div className="ml-auto h-5 w-20 rounded-full bg-line/50" />
        </div>
        <div className="mt-3 h-6 w-3/4 rounded bg-line/60" />
        <div className="mt-2 h-3 w-1/3 rounded bg-line/40" />
        <div className="mt-3 flex flex-wrap gap-2">
          <div className="h-5 w-24 rounded-full bg-line/40" />
          <div className="h-5 w-24 rounded-full bg-line/40" />
          <div className="h-5 w-24 rounded-full bg-line/30" />
        </div>
      </div>

      <div className="map-card-top map-card-bottom absolute inset-x-3 rounded-xl border border-line/70 bg-surface/90 p-4 shadow-2xl backdrop-blur-xl lg:inset-x-auto lg:bottom-auto lg:right-4 lg:w-[360px]">
        <div className="h-3 w-14 rounded bg-accent/30" />
        <div className="mt-2 h-6 w-32 rounded bg-line/60" />
        <div className="mt-2 h-3 w-48 rounded bg-line/40" />
        <div className="mt-5 grid grid-cols-2 gap-4">
          <div className="h-8 rounded bg-line/25" />
          <div className="h-8 rounded bg-line/25" />
          <div className="h-8 rounded bg-line/25" />
          <div className="h-8 rounded bg-line/25" />
        </div>
        <div className="mt-5 h-10 rounded-lg bg-accent/20" />
      </div>
    </div>
  );
}
