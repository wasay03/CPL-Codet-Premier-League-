import clsx from "clsx";
import { Check } from "lucide-react";
import type { Snapshot } from "../api/types";

/**
 * The auction runs category by category, top tier first. This strip shows which categories are
 * done, which one is on now, and how many players wait in each.
 */
export function CategoryStepper({ snap }: { snap: Snapshot }) {
  const tiers = [...snap.tiers].sort((a, b) => a.rank - b.rank);
  const active = tiers.find((t) => t.id === snap.active_tier_id);

  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ol className="flex min-w-max items-center gap-1.5 rounded-2xl border border-line bg-surface p-1.5 shadow-card sm:min-w-0">
        {tiers.map((t, i) => {
          const waiting = (snap.queues[String(t.id)] ?? []).length + (snap.lot?.tier_id === t.id ? 1 : 0);
          const current = t.id === active?.id;
          const done = !current && waiting === 0 && (!active || t.rank < active.rank);
          return (
            <li key={t.id} className="flex flex-1 items-center gap-1.5">
              {i > 0 && <span className={clsx("h-px w-3 shrink-0", done || current ? "bg-brand/40" : "bg-line")} />}
              <div
                className={clsx(
                  "flex flex-1 items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors",
                  current && "bg-brand text-white shadow-glow",
                  done && "text-muted",
                  !current && !done && "text-fg-2",
                )}
              >
                <span
                  className={clsx(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                    current ? "bg-white/20" : done ? "bg-brand-soft text-brand-ink" : "bg-well text-muted",
                  )}
                >
                  {done ? <Check size={12} strokeWidth={3} /> : i + 1}
                </span>
                <span className="whitespace-nowrap font-semibold">{t.name}</span>
                <span className={clsx("ml-auto whitespace-nowrap pl-1 text-xs tabular-nums", current ? "text-white/80" : "text-muted")}>
                  {done ? "Done" : current ? `Now · ${waiting} left` : `${waiting} waiting`}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
