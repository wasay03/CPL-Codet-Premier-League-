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
        "block rounded-2xl border bg-ink-850/90 p-4 transition-all hover:border-ink-500",
        leading ? "border-transparent ring-2" : "border-ink-700/80",
      )}
      style={leading ? ({ "--tw-ring-color": team.color, boxShadow: `0 0 36px -10px ${team.color}` } as React.CSSProperties) : undefined}
    >
      <div className="flex items-center gap-3">
        <TeamLogo team={team} size={compact ? 36 : 44} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-display text-lg font-bold leading-tight">{team.name}</span>
            {mine && <span className="rounded bg-gavel/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-gavel">You</span>}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span className={clsx("h-1.5 w-1.5 rounded-full", team.owner?.online ? "bg-emerald-400" : "bg-slate-600")} />
            {team.owner?.display_name ?? "No owner"}
          </div>
        </div>
        {leading && <span className="rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-950" style={{ background: team.color }}>Leading</span>}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-ink-900/70 py-1.5">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Purse</div>
          <div className="font-display text-lg font-bold tabular-nums">{team.purse_remaining}</div>
        </div>
        <div className="rounded-lg bg-ink-900/70 py-1.5">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Max bid</div>
          <div className="font-display text-lg font-bold tabular-nums text-gavel">{team.squad_size >= settings.max_squad ? "—" : team.max_bid}</div>
        </div>
        <div className="rounded-lg bg-ink-900/70 py-1.5">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Squad</div>
          <div className="font-display text-lg font-bold tabular-nums">
            {team.squad_size}<span className="text-slate-500">/{settings.max_squad}</span>
          </div>
        </div>
      </div>
      {!compact && (
        <div className="mt-3 flex gap-1">
          {tiers.map((t) => {
            const held = team.tier_counts[String(t.id)] ?? 0;
            return (
              <div key={t.id} className="flex-1" title={`${t.name}: ${held}/${t.max_per_team}`}>
                <div className="mb-1 truncate text-center text-[9px] font-semibold uppercase tracking-wider text-slate-500">{t.name.slice(0, 4)}</div>
                <div className="flex gap-0.5">
                  {Array.from({ length: t.max_per_team }).map((_, i) => (
                    <span key={i} className="h-1.5 flex-1 rounded-full" style={{ background: i < held ? team.color : "#2a3354" }} />
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
