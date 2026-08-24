/**
 * Shown while a route's server work is in flight.
 *
 * A skeleton in the shape of the page it replaces, so the layout does not jump
 * when content arrives — and blinking rather than pulsing, to match the app's
 * stepped motion instead of introducing a smooth animation nothing else uses.
 */
export default function Loading() {
  return (
    <div className="min-h-dvh">
      <div className="hud">
        <div className="mx-auto flex w-full max-w-md items-center justify-between gap-3 px-4 py-3">
          <span className="anim-blink font-pixel text-lg leading-none">
            MRT<span className="text-accent">Kiasu</span>
          </span>
        </div>
        <div className="h-2 w-full bg-[var(--border-soft)]" />
      </div>

      <main
        className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 pt-5"
        aria-busy="true"
      >
        <div className="pixel-box anim-blink h-32" />
        <div className="pixel-box anim-blink h-20" />
        <div className="pixel-box anim-blink h-40" />
      </main>
    </div>
  );
}
