import { useState } from "react";
import { useAudit, useHistory } from "../api/hooks";
import { Card, Empty, Page, Segmented, TierBadge } from "../components/ui";
import { useSession } from "../lib/session";
import { useAuction } from "../realtime/auctionStore";
import { Loading } from "./Teams";
import { pkr } from "../lib/money";

export function HistoryPage() {
  const isAdmin = useSession((s) => s.me?.role === "admin");
  const [tab, setTab] = useState<"lots" | "audit">("lots");
  return (
    <Page
      title="History"
      subtitle="Every lot that has gone under the hammer."
      actions={
        isAdmin && (
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              ["lots", "Lots"],
              ["audit", "Audit log"],
            ]}
          />
        )
      }
    >
      {tab === "lots" ? <Lots /> : <Audit />}
    </Page>
  );
}

const time = (ms: number | null) => (ms ? new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "");

function Lots() {
  const { data, isLoading } = useHistory();
  const snap = useAuction((s) => s.snap);
  if (isLoading || !snap) return <Loading />;
  if (!data?.length) return <Empty>No lots yet.</Empty>;
  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[680px] text-sm">
        <thead>
          <tr className="border-b border-line bg-well/60 text-left text-[11px] font-semibold uppercase tracking-[.1em] text-muted">
            <th className="px-4 py-3">#</th>
            <th className="px-4 py-3">Player</th>
            <th className="px-4 py-3">Tier</th>
            <th className="px-4 py-3">Result</th>
            <th className="px-4 py-3 text-right">Price</th>
            <th className="px-4 py-3 text-right">Bids</th>
            <th className="px-4 py-3 text-right">Drops</th>
            <th className="px-4 py-3 text-right">Time</th>
          </tr>
        </thead>
        <tbody>
          {data.map((l) => {
            const team = snap.teams.find((t) => t.id === l.team_id);
            const drop = snap.tiers.find((t) => t.id === l.dropped_to_tier_id);
            return (
              <tr key={l.id} className="border-b border-line last:border-0">
                <td className="px-4 py-2.5 text-muted">{l.id}</td>
                <td className="px-4 py-2.5 font-medium">
                  {l.player_name}
                  {l.round === "accelerated" && <span className="ml-2 text-[10px] font-bold uppercase text-fuchsia-600 dark:text-fuchsia-300">Acc</span>}
                </td>
                <td className="px-4 py-2.5"><TierBadge tier={snap.tiers.find((t) => t.id === l.tier_id)} /></td>
                <td className="px-4 py-2.5">
                  {l.status === "sold" && <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: team?.color }} />Sold to {team?.name}</span>}
                  {l.status === "unsold" && <span className="text-muted">Unsold → {l.to_pool ? "pool" : drop?.name}</span>}
                  {l.status === "cancelled" && <span className="text-muted">Cancelled / undone</span>}
                </td>
                <td className="px-4 py-2.5 text-right font-display text-base font-bold tabular-nums text-brand-ink">{pkr(l.price)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{l.bid_count}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{l.drop_count}</td>
                <td className="px-4 py-2.5 text-right text-muted">{time(l.closed_at)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

function Audit() {
  const { data, isLoading } = useAudit(true);
  if (isLoading) return <Loading />;
  if (!data?.length) return <Empty>Nothing logged yet.</Empty>;
  return (
    <Card className="divide-y divide-line">
      {data.map((a) => (
        <div key={a.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
          <span className="w-20 shrink-0 text-xs text-muted">{time(a.created_at)}</span>
          <span className="w-36 shrink-0 font-mono text-xs text-brand-ink">{a.action}</span>
          <span className="w-28 shrink-0 text-fg-2">{a.actor}</span>
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted">{JSON.stringify(a.payload)}</span>
        </div>
      ))}
    </Card>
  );
}
