import clsx from "clsx";
import { useState } from "react";
import { useAudit, useHistory } from "../api/hooks";
import { Card, Empty, Page, TierBadge } from "../components/ui";
import { useSession } from "../lib/session";
import { useAuction } from "../realtime/auctionStore";
import { Loading } from "./Teams";

export function HistoryPage() {
  const isAdmin = useSession((s) => s.me?.role === "admin");
  const [tab, setTab] = useState<"lots" | "audit">("lots");
  return (
    <Page
      title="History"
      actions={
        isAdmin && (
          <div className="flex rounded-lg bg-ink-800 p-1">
            {(["lots", "audit"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={clsx("rounded-md px-3 py-1.5 text-sm font-medium capitalize", tab === t ? "bg-ink-600 text-white" : "text-slate-400")}>
                {t === "lots" ? "Lots" : "Audit log"}
              </button>
            ))}
          </div>
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
          <tr className="border-b border-ink-700 text-left text-xs uppercase tracking-wider text-slate-500">
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
              <tr key={l.id} className="border-b border-ink-700/50 last:border-0">
                <td className="px-4 py-2.5 text-slate-500">{l.id}</td>
                <td className="px-4 py-2.5 font-medium">
                  {l.player_name}
                  {l.round === "accelerated" && <span className="ml-2 text-[10px] font-bold uppercase text-fuchsia-300">Acc</span>}
                </td>
                <td className="px-4 py-2.5"><TierBadge tier={snap.tiers.find((t) => t.id === l.tier_id)} /></td>
                <td className="px-4 py-2.5">
                  {l.status === "sold" && <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: team?.color }} />Sold to {team?.name}</span>}
                  {l.status === "unsold" && <span className="text-slate-400">Unsold → {l.to_pool ? "pool" : drop?.name}</span>}
                  {l.status === "cancelled" && <span className="text-slate-500">Cancelled / undone</span>}
                </td>
                <td className="px-4 py-2.5 text-right font-display text-base font-bold tabular-nums text-gavel">{l.price ?? "—"}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{l.bid_count}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{l.drop_count}</td>
                <td className="px-4 py-2.5 text-right text-slate-500">{time(l.closed_at)}</td>
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
    <Card className="divide-y divide-ink-700/60">
      {data.map((a) => (
        <div key={a.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
          <span className="w-20 shrink-0 text-xs text-slate-500">{time(a.created_at)}</span>
          <span className="w-36 shrink-0 font-mono text-xs text-gavel">{a.action}</span>
          <span className="w-28 shrink-0 text-slate-300">{a.actor}</span>
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-500">{JSON.stringify(a.payload)}</span>
        </div>
      ))}
    </Card>
  );
}
