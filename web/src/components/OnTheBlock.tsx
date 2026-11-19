import { AnimatePresence, motion } from "framer-motion";
import { Clock, Crown } from "lucide-react";
import type { Snapshot } from "../api/types";
import { Avatar, Card, Eyebrow, TeamLogo, TierBadge } from "./ui";
import { Countdown } from "./Countdown";

const ROLE_LABEL: Record<string, string> = {
  batter: "Batter",
  bowler: "Bowler",
  "all-rounder": "All-rounder",
  "wicket-keeper": "Wicket-keeper",
};

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-well px-2.5 py-1 text-xs font-medium text-fg-2">{children}</span>;
}

export function OnTheBlock({ snap, msLeft }: { snap: Snapshot; msLeft: number }) {
  const lot = snap.lot!;
  const p = lot.player;
  const tier = snap.tiers.find((t) => t.id === lot.tier_id);
  const leader = snap.teams.find((t) => t.id === lot.high_team_id);
  const total = (lot.high_bid ? snap.settings.reset_timer_s : snap.settings.opening_timer_s) * 1000;
  const paused = snap.status === "paused";

  return (
    <Card className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 transition-[background] duration-700"
        style={{ background: `radial-gradient(600px 260px at 90% -10%, ${leader?.color ?? "#7c3aed"}26, transparent 70%)` }}
      />
      <div className="relative flex items-center gap-6 p-5 sm:p-7">
        <div className="flex flex-1 items-center gap-4 sm:gap-6">
          <div className="shrink-0 self-start rounded-full bg-gradient-to-br from-brand to-gold p-[3px] shadow-glow sm:self-center">
            <Avatar name={p.name} imageId={p.photo_image_id} size={104} className="hidden ring-4 ring-surface sm:inline-flex" />
            <Avatar name={p.name} imageId={p.photo_image_id} size={68} className="ring-[3px] ring-surface sm:hidden" />
          </div>
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> On the block
              </span>
              <TierBadge tier={tier} size="md" />
              {lot.round === "accelerated" && (
                <span className="rounded-full bg-fuchsia-500/10 px-2.5 py-1 text-xs font-bold text-fuchsia-600 ring-1 ring-inset ring-fuchsia-500/20 dark:text-fuchsia-300">
                  Accelerated
                </span>
              )}
              {p.drop_count > 0 && <Chip>Dropped ×{p.drop_count}</Chip>}
            </div>
            <h2 className="font-display text-3xl font-bold leading-tight tracking-tight sm:text-[2.6rem]">{p.name}</h2>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {p.role && <Chip>{ROLE_LABEL[p.role] ?? p.role}</Chip>}
              {p.batting_style && <Chip>Bat: {p.batting_style}</Chip>}
              {p.bowling_style && <Chip>Bowl: {p.bowling_style}</Chip>}
              <Chip>
                Base <b className="text-fg">{lot.opening_price}</b>
              </Chip>
            </div>
            {p.note && <p className="mt-3 max-w-md text-sm italic text-fg-2">“{p.note}”</p>}
          </div>
        </div>
        <div className="hidden sm:block">
          <Countdown msLeft={msLeft} totalMs={total} paused={paused} />
        </div>
      </div>

      <div className="relative grid gap-px border-t border-line bg-line sm:grid-cols-[1.2fr_1fr]">
        <div className="flex items-center justify-between gap-4 bg-surface/95 px-5 py-5 sm:px-7">
          <div>
            <Eyebrow>{lot.high_bid ? "Current bid" : "Opening bid"}</Eyebrow>
            <AnimatePresence mode="popLayout">
              <motion.div
                key={lot.high_bid ?? "open"}
                initial={{ y: 18, opacity: 0, scale: 0.92 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                className="mt-1 font-display text-7xl font-extrabold leading-none tracking-tight tabular-nums text-fg sm:text-8xl"
              >
                {lot.high_bid ?? lot.opening_price}
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="sm:hidden">
            <Countdown msLeft={msLeft} totalMs={total} paused={paused} size="sm" />
          </div>
        </div>
        <div className="flex items-center gap-3 bg-surface/95 px-5 py-5 sm:px-7">
          {leader ? (
            <>
              <span className="h-12 w-1 rounded-full" style={{ background: leader.color }} />
              <TeamLogo team={leader} size={52} />
              <div className="min-w-0">
                <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[.12em] text-muted">
                  <Crown size={12} className="text-gold" /> Leading
                </div>
                <div className="truncate text-xl font-bold tracking-tight">{leader.name}</div>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 text-sm font-medium text-muted">
              <Clock size={16} /> No bids yet
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
