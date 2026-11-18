import clsx from "clsx";

export function Countdown({ msLeft, totalMs, paused }: { msLeft: number; totalMs: number; paused?: boolean }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const frac = totalMs > 0 ? Math.max(0, Math.min(1, msLeft / totalMs)) : 0;
  const secs = Math.ceil(msLeft / 1000);
  const danger = msLeft <= 5000 && msLeft > 0;
  return (
    <div className="relative h-32 w-32 shrink-0">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="currentColor" strokeWidth="8" className="text-ink-700" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          className={clsx("transition-[stroke-dashoffset] duration-100 ease-linear", danger ? "stroke-rose-500" : paused ? "stroke-slate-500" : "stroke-gavel")}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={clsx("font-display text-5xl font-extrabold tabular-nums leading-none", danger ? "animate-pulse text-rose-400" : "text-white")}>{secs}</span>
        <span className="mt-1 text-[10px] font-semibold uppercase tracking-[.2em] text-slate-500">{paused ? "paused" : "seconds"}</span>
      </div>
    </div>
  );
}
