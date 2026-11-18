import { Gavel, Trophy, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { BidPanel } from "../components/BidPanel";
import { ControlBar } from "../components/ControlBar";
import { OnTheBlock } from "../components/OnTheBlock";
import { SidePanels } from "../components/SidePanels";
import { SoldOverlay } from "../components/SoldOverlay";
import { TeamCard } from "../components/TeamCard";
import { Button, Card, Spinner, TierBadge } from "../components/ui";
import type { Snapshot } from "../api/types";
import { useSession } from "../lib/session";
import { useAuction } from "../realtime/auctionStore";
import { useCountdown } from "../realtime/useCountdown";

export function RoomPage() {
  const snap = useAuction((s) => s.snap);
  const me = useSession((s) => s.me);
  const msLeft = useCountdown(snap?.lot?.ends_at, snap?.status === "paused" ? snap?.lot?.paused_remaining_ms : null);

  if (!snap)
    return (
      <div className="flex h-[60vh] items-center justify-center gap-3 text-slate-400">
        <Spinner /> Connecting to the auction room…
      </div>
    );

  const isAdmin = me?.role === "admin";
  const isOwner = me?.role === "owner";

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-6 pt-4 sm:px-6">
      {isAdmin && (
        <div className="mb-4">
          <ControlBar snap={snap} />
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          {snap.lot ? <OnTheBlock snap={snap} msLeft={msLeft} /> : <IdleCard snap={snap} isAdmin={isAdmin} />}
          {isOwner && <BidPanel snap={snap} msLeft={msLeft} />}
          {snap.lot && snap.lot.bids.length > 0 && <BidLadder snap={snap} />}
          <div className="hidden lg:block">
            <SidePanels snap={snap} />
          </div>
        </div>
        <div className="space-y-3">
          {snap.teams.map((t) => (
            <TeamCard
              key={t.id}
              team={t}
              tiers={snap.tiers}
              settings={snap.settings}
              leading={snap.lot?.high_team_id === t.id}
              mine={me?.team_id === t.id}
            />
          ))}
          <div className="lg:hidden">
            <SidePanels snap={snap} />
          </div>
        </div>
      </div>
      <SoldOverlay />
    </div>
  );
}

function BidLadder({ snap }: { snap: Snapshot }) {
  return (
    <Card className="p-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-[.18em] text-slate-500">Bids on this player · {snap.lot!.bid_count}</div>
      <div className="flex flex-wrap gap-2">
        {snap.lot!.bids.map((b, i) => {
          const t = snap.teams.find((x) => x.id === b.team_id);
          return (
            <span
              key={b.id}
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm tabular-nums"
              style={{ borderColor: `${t?.color}66`, background: i === 0 ? `${t?.color}22` : undefined }}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: t?.color }} />
              <b>{b.amount}</b>
              <span className="text-xs text-slate-400">{t?.short_code}</span>
            </span>
          );
        })}
      </div>
    </Card>
  );
}

function IdleCard({ snap, isAdmin }: { snap: Snapshot; isAdmin: boolean }) {
  const nextTier = snap.tiers.find((t) => (snap.queues[String(t.id)] ?? []).length > 0);
  const mainDone = snap.status === "running" && snap.queued_count === 0;

  let icon = <Gavel size={40} />;
  let title = "";
  let body: React.ReactNode = null;

  if (snap.status === "not_started") {
    title = "The room is open";
    body = isAdmin ? "Check the rules and players, then press Start auction." : "Waiting for the auctioneer to start. Get your strategy ready.";
  } else if (snap.status === "finished") {
    icon = <Trophy size={40} />;
    title = "Auction complete";
    body = (
      <Link to="/results">
        <Button variant="primary" className="mt-2">See final squads</Button>
      </Link>
    );
  } else if (snap.status === "paused") {
    title = "Paused";
    body = "The auctioneer paused the room. Hang tight.";
  } else if (mainDone) {
    icon = <Zap size={40} />;
    title = "Main round complete";
    body =
      snap.settings.accelerated_enabled && snap.unsold_pool.length
        ? isAdmin
          ? "Owners can now nominate unsold players. Start the accelerated round when they're done, or end the auction."
          : "Nominate players from the Unsold pool to bring them back in the accelerated round."
        : "No players left to auction.";
  } else {
    title = "Next player coming up";
    body = nextTier ? (
      <span className="inline-flex items-center gap-2">
        From the <TierBadge tier={nextTier} /> queue · {snap.queues[String(nextTier.id)].length} waiting
      </span>
    ) : null;
  }

  return (
    <Card className="flex min-h-[300px] flex-col items-center justify-center p-8 text-center">
      <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gavel/10 text-gavel">{icon}</div>
      <h2 className="font-display text-4xl font-extrabold uppercase tracking-wide">{title}</h2>
      <div className="mt-2 max-w-md text-slate-400">{body}</div>
    </Card>
  );
}
