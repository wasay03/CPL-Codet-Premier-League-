import { Download } from "lucide-react";
import { api } from "../api/client";
import { Avatar, Button, Card, Money, Page, TeamLogo, TierBadge } from "../components/ui";
import { useSession } from "../lib/session";
import { toast } from "../lib/toast";
import { useAuction } from "../realtime/auctionStore";
import { Loading } from "./Teams";
import { pkr } from "../lib/money";

export function ResultsPage() {
  const snap = useAuction((s) => s.snap);
  const me = useSession((s) => s.me);
  if (!snap) return <Loading />;
  const tierRank = Object.fromEntries(snap.tiers.map((t) => [t.id, t.rank]));
  const unsold = [...snap.unsold_pool, ...Object.values(snap.queues).flat()];

  return (
    <Page
      title={snap.status === "finished" ? "Final squads" : "Squads so far"}
      actions={
        me?.role === "admin" && (
          <Button variant="outline" onClick={() => api.download("/export/results.csv", "cpl-results.csv").catch(toast.error)}>
            <Download size={16} /> Download CSV
          </Button>
        )
      }
    >
      <div className="grid gap-4 md:grid-cols-3">
        {snap.teams.map((team) => (
          <Card key={team.id} className="overflow-hidden">
            <div className="flex items-center gap-3 p-4" style={{ backgroundImage: `linear-gradient(90deg, ${team.color}2e, transparent)` }}>
              <TeamLogo team={team} size={48} />
              <div className="flex-1">
                <div className="text-lg font-bold leading-tight tracking-tight">{team.name}</div>
                <div className="text-xs text-muted">{team.owner?.display_name}</div>
              </div>
            </div>
            <div className="grid grid-cols-3 border-y border-line text-center">
              <div className="py-2"><div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Players</div><div className="font-display text-xl font-bold">{team.squad_size}</div></div>
              <div className="border-x border-line py-2"><div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Spent</div><Money value={team.purse_spent} className="block font-display text-xl font-bold" /></div>
              <div className="py-2"><div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Left</div><Money value={team.purse_remaining} className="block font-display text-xl font-bold text-brand-ink" /></div>
            </div>
            <ul className="divide-y divide-line">
              {[...team.squad]
                .sort((a, b) => tierRank[a.tier_id] - tierRank[b.tier_id] || (b.sold_price ?? 0) - (a.sold_price ?? 0))
                .map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-4 py-2">
                    <Avatar name={p.name} imageId={p.photo_image_id} size={30} />
                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 truncate text-sm font-semibold">{p.name}</div>
                      <TierBadge tier={snap.tiers.find((t) => t.id === p.tier_id)} />
                    </div>
                    <span className="font-display text-lg font-bold tabular-nums text-brand-ink">{pkr(p.sold_price)}</span>
                  </li>
                ))}
              {team.squad.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">No players yet</li>}
            </ul>
          </Card>
        ))}
      </div>
      {unsold.length > 0 && (
        <Card className="mt-6 p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[.18em] text-muted">Unsold · {unsold.length}</div>
          <div className="flex flex-wrap gap-2">
            {unsold.map((p) => (
              <span key={p.id} className="rounded-full border border-line bg-well/60 px-3 py-1 text-sm text-fg-2">{p.name}</span>
            ))}
          </div>
        </Card>
      )}
    </Page>
  );
}
