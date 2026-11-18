import { AnimatePresence, motion } from "framer-motion";
import { Clock } from "lucide-react";
import type { Snapshot } from "../api/types";
import { Avatar, Card, TeamLogo, TierBadge } from "./ui";
import { Countdown } from "./Countdown";

const ROLE_LABEL: Record<string, string> = {
  batter: "Batter",
  bowler: "Bowler",
  "all-rounder": "All-rounder",
  "wicket-keeper": "Wicket-keeper",
};

export function OnTheBlock({ snap, msLeft }: { snap: Snapshot; msLeft: number }) {
  const lot = snap.lot!;
  const p = lot.player;
  const tier = snap.tiers.find((t) => t.id === lot.tier_id);
  const leader = snap.teams.find((t) => t.id === lot.high_team_id);
  const total = (lot.high_bid ? snap.settings.reset_timer_s : snap.settings.opening_timer_s) * 1000;
  const paused = snap.status === "paused";

  return (
    <Card className="relative overflow-hidden p-5 sm:p-6">
      <div
        className="pointer-events-none absolute inset-0 opacity-30 transition-colors duration-500"
        style={{ background: `radial-gradient(ellipse at 80% 0%, ${leader?.color ?? "#f5b301"}55, transparent 60%)` }}
      />
      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-4 sm:gap-5">
          <Avatar name={p.name} imageId={p.photo_image_id} size={104} className="ring-4 ring-ink-700" />
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <TierBadge tier={tier} size="md" />
              {lot.round === "accelerated" && <span className="rounded-md bg-fuchsia-500/20 px-2 py-1 text-xs font-bold uppercase text-fuchsia-300">Accelerated</span>}
              {p.drop_count > 0 && <span className="rounded-md bg-ink-700 px-2 py-1 text-xs text-slate-300">Dropped ×{p.drop_count}</span>}
            </div>
            <h2 className="font-display text-4xl font-extrabold uppercase leading-none tracking-wide sm:text-5xl">{p.name}</h2>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-400">
              {p.role && <span>{ROLE_LABEL[p.role] ?? p.role}</span>}
              {p.batting_style && <span>Bat: {p.batting_style}</span>}
              {p.bowling_style && <span>Bowl: {p.bowling_style}</span>}
              <span>Base <b className="text-slate-200">{lot.opening_price}</b></span>
            </div>
            {p.note && <p className="mt-2 max-w-md text-sm italic text-slate-300">“{p.note}”</p>}
          </div>
        </div>
        <Countdown msLeft={msLeft} totalMs={total} paused={paused} />
      </div>

      <div className="relative mt-6 flex flex-wrap items-end justify-between gap-4 border-t border-ink-700 pt-5">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[.2em] text-slate-500">{lot.high_bid ? "Current bid" : "Opening bid"}</div>
          <AnimatePresence mode="popLayout">
            <motion.div
              key={lot.high_bid ?? "open"}
              initial={{ y: 18, opacity: 0, scale: 0.9 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              className="font-display text-7xl font-black leading-none tabular-nums sm:text-8xl"
              style={{ color: leader?.color ?? "#94a3b8" }}
            >
              {lot.high_bid ?? lot.opening_price}
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="flex items-center gap-3">
          {leader ? (
            <>
              <TeamLogo team={leader} size={48} />
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-500">Leading</div>
                <div className="font-display text-2xl font-bold" style={{ color: leader.color }}>{leader.name}</div>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 text-slate-400">
              <Clock size={16} /> No bids yet
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
