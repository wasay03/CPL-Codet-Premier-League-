import clsx from "clsx";

export function Countdown({ msLeft, totalMs, paused, size = "lg" }: { msLeft: number; totalMs: number; paused?: boolean; size?: "sm" | "lg" }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const frac = totalMs > 0 ? Math.max(0, Math.min(1, msLeft / totalMs)) : 0;
  const secs = Math.ceil(msLeft / 1000);
  const danger = msLeft <= 5000 && msLeft > 0;
  return (
    <div className={clsx("relative shrink-0", size === "lg" ? "h-32 w-32" : "h-24 w-24")}>
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="currentColor" strokeWidth="7" className="text-well-2" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          className={clsx("transition-[stroke-dashoffset] duration-100 ease-linear", danger ? "stroke-danger" : paused ? "stroke-faint" : "stroke-brand")}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={clsx("font-display font-bold tabular-nums leading-none", size === "lg" ? "text-5xl" : "text-4xl", danger ? "animate-pulse text-danger" : "text-fg")}>{secs}</span>
        <span className="mt-1 text-[10px] font-semibold uppercase tracking-[.18em] text-muted">{paused ? "paused" : "seconds"}</span>
      </div>
    </div>
  );
}
