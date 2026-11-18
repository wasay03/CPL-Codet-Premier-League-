import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import type { Snapshot, Team } from "../api/types";
import { TeamCard } from "../components/TeamCard";
import { Avatar, Card, Empty, Page, Spinner, Stat, TeamLogo, TierBadge } from "../components/ui";
import { useSession } from "../lib/session";
import { useAuction } from "../realtime/auctionStore";

export function TeamsPage() {
  const snap = useAuction((s) => s.snap);
  const me = useSession((s) => s.me);
  if (!snap) return <Loading />;
  return (
    <Page title="Teams">
      <div className="grid gap-4 md:grid-cols-3">
        {snap.teams.map((t) => (
          <div key={t.id} className="space-y-3">
            <TeamCard team={t} tiers={snap.tiers} settings={snap.settings} mine={me?.team_id === t.id} />
            <SquadList snap={snap} team={t} />
          </div>
        ))}
      </div>
    </Page>
  );
}

export function TeamDetailPage() {
  const { id } = useParams();
  const snap = useAuction((s) => s.snap);
  if (!snap) return <Loading />;
  const team = snap.teams.find((t) => t.id === Number(id));
  if (!team) return <Page title="Team"><Empty>Team not found.</Empty></Page>;
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <Link to="/teams" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white">
        <ArrowLeft size={14} /> All teams
      </Link>
      <Card className="mb-4 p-6" style={{ background: `linear-gradient(135deg, ${team.color}33, transparent 60%)` }}>
        <div className="flex items-center gap-4">
          <TeamLogo team={team} size={72} />
          <div>
            <h1 className="font-display text-4xl font-extrabold uppercase">{team.name}</h1>
            <p className="text-slate-400">Owner: {team.owner?.display_name ?? "—"}</p>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Purse left" value={team.purse_remaining} accent />
          <Stat label="Spent" value={team.purse_spent} />
          <Stat label="Squad" value={`${team.squad_size}/${snap.settings.max_squad}`} />
          <Stat label="Max bid" value={team.squad_size >= snap.settings.max_squad ? "—" : team.max_bid} />
        </div>
      </Card>
      <SquadList snap={snap} team={team} showSlots />
    </div>
  );
}

function SquadList({ snap, team, showSlots }: { snap: Snapshot; team: Team; showSlots?: boolean }) {
  return (
    <Card className="p-4">
      {snap.tiers.map((tier) => {
        const players = team.squad.filter((p) => p.tier_id === tier.id);
        const open = team.open_slots[String(tier.id)] ?? 0;
        return (
          <div key={tier.id} className="border-b border-ink-700/60 py-2.5 last:border-0">
            <div className="mb-1.5 flex items-center justify-between">
              <TierBadge tier={tier} />
              <span className="text-xs text-slate-500">
                {players.length}/{tier.max_per_team}
                {showSlots && open > 0 && ` · ${open} open`}
              </span>
            </div>
            {players.length === 0 ? (
              <div className="text-xs text-slate-600">—</div>
            ) : (
              <ul className="space-y-1">
                {players.map((p) => (
                  <li key={p.id} className="flex items-center gap-2.5">
                    <Avatar name={p.name} imageId={p.photo_image_id} size={26} />
                    <span className="flex-1 truncate text-sm">{p.name}</span>
                    <span className="font-display text-base font-bold tabular-nums text-gavel">{p.sold_price}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </Card>
  );
}

export function Loading() {
  return (
    <div className="flex h-[50vh] items-center justify-center gap-3 text-slate-400">
      <Spinner /> Loading…
    </div>
  );
}
