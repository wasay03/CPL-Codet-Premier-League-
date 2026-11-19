import clsx from "clsx";
import { Check, Gavel, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "../api/client";
import type { Snapshot } from "../api/types";
import { useSession } from "../lib/session";
import { toast } from "../lib/toast";
import { useAuction } from "../realtime/auctionStore";
import { refreshSnapshot } from "../realtime/poll";
import { Avatar, Button, Card, Empty, TierBadge } from "./ui";
import { pkr } from "../lib/money";

type Tab = "queue" | "pool" | "feed";

export function SidePanels({ snap }: { snap: Snapshot }) {
  const me = useSession((s) => s.me);
  const isAdmin = me?.role === "admin";
  const mainDone = snap.status === "running" && snap.queued_count === 0 && !snap.lot;
  const [tab, setTab] = useState<Tab>(mainDone && snap.unsold_pool.length ? "pool" : "queue");
  const live = snap.status === "running" || snap.status === "accelerated";

  const pick = async (id: number) => {
    try {
      await api.post("/auction/next", { mode: "pick", player_id: id });
      await refreshSnapshot();
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <Card className="flex min-h-[320px] flex-col overflow-hidden">
      <div className="m-2 mb-0 flex rounded-xl bg-well p-1">
        {(
          [
            ["queue", `Queue · ${snap.queued_count}`],
            ["pool", `Unsold · ${snap.unsold_pool.length}`],
            ["feed", "Live feed"],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={clsx(
              "flex-1 rounded-lg px-2 py-2 text-xs font-semibold transition-all",
              tab === k ? "bg-surface text-brand-ink shadow-sm" : "text-muted hover:text-fg",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="max-h-[520px] flex-1 overflow-y-auto p-3">
        {tab === "queue" && (
          <div className="space-y-4">
            {snap.queued_count === 0 && <Empty>No players waiting.</Empty>}
            {snap.tiers.map((t) => {
              const list = snap.queues[String(t.id)] ?? [];
              if (!list.length) return null;
              return (
                <div key={t.id}>
                  <div className="mb-2 flex items-center gap-2">
                    <TierBadge tier={t} />
                    <span className="text-xs text-muted">{list.length} waiting · base {pkr(t.base_price)}</span>
                  </div>
                  <ul className="space-y-1">
                    {list.map((p) => (
                      <li key={p.id} className="group flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-well">
                        <Avatar name={p.name} imageId={p.photo_image_id} size={28} />
                        <span className="flex-1 truncate text-sm font-medium">{p.name}</span>
                        {p.drop_count > 0 && <span className="text-[10px] text-muted">↓{p.drop_count}</span>}
                        {isAdmin && live && !snap.lot && (
                          <button
                            onClick={() => pick(p.id)}
                            className="rounded-lg p-1.5 text-muted opacity-0 transition hover:bg-brand hover:text-white group-hover:opacity-100 max-sm:opacity-100"
                            title="Put on the block"
                          >
                            <Gavel size={14} />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
        {tab === "pool" && <PoolPanel snap={snap} />}
        {tab === "feed" && <FeedPanel snap={snap} />}
      </div>
    </Card>
  );
}

function PoolPanel({ snap }: { snap: Snapshot }) {
  const me = useSession((s) => s.me);
  const isOwner = me?.role === "owner" && me.team_id != null;
  const mine = snap.nominations[String(me?.team_id)] ?? [];
  const [sel, setSel] = useState<number[] | null>(null);
  const chosen = sel ?? mine;
  const canNominate = isOwner && (snap.status === "running" || (snap.status === "paused" && snap.resume_status !== "accelerated"));
  const nominatedBy = useMemo(() => {
    const m: Record<number, number[]> = {};
    for (const [team, ids] of Object.entries(snap.nominations)) for (const id of ids) (m[id] ??= []).push(Number(team));
    return m;
  }, [snap.nominations]);

  const save = async () => {
    try {
      await api.post("/auction/nominations", { player_ids: chosen });
      await refreshSnapshot();
      toast.ok("Nominations saved");
      setSel(null);
    } catch (e) {
      toast.error(e);
    }
  };

  if (!snap.unsold_pool.length) return <Empty>The unsold pool is empty.</Empty>;
  return (
    <div>
      {canNominate && (
        <p className="mb-3 rounded-xl bg-brand-soft p-3 text-xs font-medium text-brand-ink">
          <Sparkles size={12} className="mr-1 inline" />
          Pick players to bring back in the accelerated round at the Emerging base price.
        </p>
      )}
      <ul className="space-y-1">
        {snap.unsold_pool.map((p) => {
          const on = chosen.includes(p.id);
          return (
            <li key={p.id}>
              <button
                disabled={!canNominate}
                onClick={() => setSel(on ? chosen.filter((x) => x !== p.id) : [...chosen, p.id])}
                className={clsx("flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left", canNominate && "hover:bg-well", on && "bg-brand-soft")}
              >
                <Avatar name={p.name} imageId={p.photo_image_id} size={28} />
                <span className="flex-1 truncate text-sm font-medium">{p.name}</span>
                <span className="flex gap-1">
                  {(nominatedBy[p.id] ?? []).map((tid) => {
                    const t = snap.teams.find((x) => x.id === tid);
                    return <span key={tid} className="h-2 w-2 rounded-full" style={{ background: t?.color }} title={`Nominated by ${t?.name}`} />;
                  })}
                </span>
                {canNominate && <span className={clsx("flex h-5 w-5 items-center justify-center rounded-md border", on ? "border-brand bg-brand text-white" : "border-line-strong")}>{on && <Check size={12} />}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {canNominate && sel !== null && (
        <Button variant="primary" className="mt-3 w-full" onClick={save}>
          Save {chosen.length} nomination{chosen.length === 1 ? "" : "s"}
        </Button>
      )}
    </div>
  );
}

function FeedPanel({ snap }: { snap: Snapshot }) {
  const feed = useAuction((s) => s.feed);
  const items = feed.length
    ? feed
    : snap.recent.map((r) => ({
        id: `r${r.id}`,
        at: r.closed_at ?? 0,
        kind: r.status === "sold" ? "sold" : "unsold",
        teamId: r.team_id,
        text:
          r.status === "sold"
            ? `${r.player_name} SOLD to ${snap.teams.find((t) => t.id === r.team_id)?.name} for ${pkr(r.price)}`
            : r.status === "cancelled"
              ? `${r.player_name} — lot cancelled`
              : `${r.player_name} unsold`,
      }));
  if (!items.length) return <Empty>Bids and results will appear here.</Empty>;
  return (
    <ul className="space-y-1.5">
      {items.map((f) => {
        const team = snap.teams.find((t) => t.id === f.teamId);
        return (
          <li key={f.id} className={clsx("flex items-start gap-2.5 rounded-xl px-2.5 py-2 text-sm text-fg-2", f.kind === "sold" && "bg-brand-soft font-semibold text-brand-ink")}>
            <span className={clsx("mt-1.5 h-2 w-2 shrink-0 rounded-full", !team && (f.kind === "unsold" ? "bg-faint" : "bg-line-strong"))} style={team ? { background: team.color } : undefined} />
            <span className="flex-1">{f.text}</span>
            <span className="mt-0.5 shrink-0 text-[10px] tabular-nums text-faint">
              {f.at ? new Date(f.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : ""}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
