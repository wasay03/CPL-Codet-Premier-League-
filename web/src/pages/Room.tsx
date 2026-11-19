import clsx from "clsx";
import { Eye, Gavel, Pause, Trophy, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { BidPanel } from "../components/BidPanel";
import { ControlBar } from "../components/ControlBar";
import { OnTheBlock } from "../components/OnTheBlock";
import { SidePanels } from "../components/SidePanels";
import { SoldOverlay } from "../components/SoldOverlay";
import { TeamCard } from "../components/TeamCard";
import { Button, Card, Eyebrow, Spinner, TierBadge } from "../components/ui";
import type { Snapshot } from "../api/types";
import { useSession } from "../lib/session";
import { useAuction } from "../realtime/auctionStore";
import { useCountdown } from "../realtime/useCountdown";
import { pkr } from "../lib/money";

export function RoomPage() {
  const snap = useAuction((s) => s.snap);
  const me = useSession((s) => s.me);
  const msLeft = useCountdown(snap?.lot?.ends_at, snap?.status === "paused" ? snap?.lot?.paused_remaining_ms : null);

  if (!snap)
    return (
      <div className="flex h-[60vh] items-center justify-center gap-3 text-muted">
        <Spinner /> Connecting to the auction room…
      </div>
    );

  const isAdmin = me?.role === "admin";
  const isOwner = me?.role === "owner";
  const isViewer = me?.role === "viewer";

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-6 pt-6 sm:px-6">
      {isAdmin && (
        <div className="mb-4">
          <ControlBar snap={snap} />
        </div>
      )}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          {snap.lot ? <OnTheBlock snap={snap} msLeft={msLeft} /> : <IdleCard snap={snap} isAdmin={isAdmin} isViewer={isViewer} />}
          {isOwner && <BidPanel snap={snap} msLeft={msLeft} />}
          {isViewer && <SpectatorBar />}
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
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <Eyebrow>Bids on this player</Eyebrow>
        <span className="rounded-full bg-well px-2 py-0.5 text-xs font-bold tabular-nums text-fg-2">{snap.lot!.bid_count}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {snap.lot!.bids.map((b, i) => {
          const t = snap.teams.find((x) => x.id === b.team_id);
          return (
            <span
              key={b.id}
              className={clsx(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm tabular-nums",
                i === 0 ? "border-transparent font-semibold text-white shadow-sm" : "border-line bg-surface text-fg-2",
              )}
              style={i === 0 ? { background: t?.color } : undefined}
            >
              {i !== 0 && <span className="h-2 w-2 rounded-full" style={{ background: t?.color }} />}
              <b>{pkr(b.amount)}</b>
              <span className={clsx("text-xs", i === 0 ? "text-white/80" : "text-muted")}>{t?.short_code}</span>
            </span>
          );
        })}
      </div>
    </Card>
  );
}

/** Shown to the viewer login where an owner would see the bid button. */
function SpectatorBar() {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-fg-2 shadow-card">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-ink">
        <Eye size={18} />
      </span>
      <span>
        <b className="text-fg">You're watching live.</b> Bids, sales and purses update here as they happen. Only team owners can bid.
      </span>
    </div>
  );
}

function IdleCard({ snap, isAdmin, isViewer }: { snap: Snapshot; isAdmin: boolean; isViewer: boolean }) {
  const nextTier = snap.tiers.find((t) => (snap.queues[String(t.id)] ?? []).length > 0);
  const mainDone = snap.status === "running" && snap.queued_count === 0;

  let icon: React.ReactNode = <Gavel size={34} />;
  let title = "";
  let body: React.ReactNode = null;

  if (snap.status === "not_started") {
    icon = null;
    title = "The room is open";
    body = isAdmin
      ? "Check the rules and players, then press Start auction."
      : isViewer
        ? "Waiting for the auctioneer to start. Browse the players and teams in the meantime."
        : "Waiting for the auctioneer to start. Get your strategy ready.";
  } else if (snap.status === "finished") {
    icon = <Trophy size={34} />;
    title = "Auction complete";
    body = (
      <Link to="/results">
        <Button variant="primary" className="mt-3">See final squads</Button>
      </Link>
    );
  } else if (snap.status === "paused") {
    icon = <Pause size={34} />;
    title = "Paused";
    body = "The auctioneer paused the room. Hang tight.";
  } else if (mainDone) {
    icon = <Zap size={34} />;
    title = "Main round complete";
    body =
      snap.settings.accelerated_enabled && snap.unsold_pool.length
        ? isAdmin
          ? "Owners can now nominate unsold players. Start the accelerated round when they're done, or end the auction."
          : isViewer
            ? "Owners are nominating unsold players to bring back in the accelerated round."
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
    <Card className="relative flex min-h-[320px] flex-col items-center justify-center overflow-hidden p-8 text-center">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(500px_220px_at_50%_0%,rgb(var(--brand)/.10),transparent)]" />
      {icon ? (
        <div className="relative mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-brand-soft text-brand-ink">{icon}</div>
      ) : (
        <img src="/logo.webp" alt="" width={150} height={150} className="relative mb-3 h-[150px] w-[150px] object-contain drop-shadow-xl" />
      )}
      <h2 className="relative text-3xl font-extrabold tracking-tight">{title}</h2>
      <div className="relative mt-2 max-w-md text-muted">{body}</div>
    </Card>
  );
}
