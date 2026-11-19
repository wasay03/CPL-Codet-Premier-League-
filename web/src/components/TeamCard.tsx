import clsx from "clsx";
import { Link } from "react-router-dom";
import type { Settings, Team, Tier } from "../api/types";
import { TeamLogo } from "./ui";

export function TeamCard({ team, tiers, settings, leading, mine, compact }: {
  team: Team; tiers: Tier[]; settings: Settings; leading?: boolean; mine?: boolean; compact?: boolean;
}) {
  return (
    <Link
      to={`/teams/${team.id}`}
      className={clsx(
        "group relative block overflow-hidden rounded-2xl border bg-surface p-4 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-pop",
        leading ? "border-transparent ring-2" : "border-line hover:border-line-strong",
      )}
      style={leading ? ({ "--tw-ring-color": team.color, boxShadow: `0 12px 36px -12px ${team.color}` } as React.CSSProperties) : undefined}
    >
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: team.color }} />
      <div className="flex items-center gap-3">
        <TeamLogo team={team} size={compact ? 36 : 44} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-base font-bold tracking-tight">{team.name}</span>
            {mine && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-ink">You</span>}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <span className={clsx("h-1.5 w-1.5 rounded-full", team.owner?.online ? "bg-ok" : "bg-faint")} />
            {team.owner?.display_name ?? "No owner"}
          </div>
        </div>
        {leading && (
          <span className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm" style={{ background: team.color }}>
            Leading
          </span>
        )}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-well/70 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Purse</div>
          <div className="font-display text-lg font-bold tabular-nums">{team.purse_remaining}</div>
        </div>
        <div className="rounded-xl bg-brand-soft/70 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-ink/80">Max bid</div>
          <div className="font-display text-lg font-bold tabular-nums text-brand-ink">{team.squad_size >= settings.max_squad ? "—" : team.max_bid}</div>
        </div>
        <div className="rounded-xl bg-well/70 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Squad</div>
          <div className="font-display text-lg font-bold tabular-nums">
            {team.squad_size}
            <span className="text-faint">/{settings.max_squad}</span>
          </div>
        </div>
      </div>
      {!compact && (
        <div className="mt-3.5 flex gap-1.5">
          {tiers.map((t) => {
            const held = team.tier_counts[String(t.id)] ?? 0;
            return (
              <div key={t.id} className="flex-1" title={`${t.name}: ${held}/${t.max_per_team}`}>
                <div className="mb-1 truncate text-center text-[9px] font-semibold uppercase tracking-wider text-muted">{t.name.slice(0, 4)}</div>
                <div className="flex gap-0.5">
                  {Array.from({ length: t.max_per_team }).map((_, i) => (
                    <span key={i} className={clsx("h-1.5 flex-1 rounded-full", i >= held && "bg-well-2")} style={i < held ? { background: team.color } : undefined} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Link>
  );
}
