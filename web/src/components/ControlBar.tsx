import { FastForward, Gavel, Pause, Play, Plus, Shuffle, SkipForward, Square, Undo2, Zap } from "lucide-react";
import { useState } from "react";
import { api } from "../api/client";
import type { Snapshot } from "../api/types";
import { toast } from "../lib/toast";
import { refreshSnapshot } from "../realtime/poll";
import { Button } from "./ui";

export function ControlBar({ snap }: { snap: Snapshot }) {
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, path: string, body?: unknown, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(key);
    try {
      await api.post(`/auction/${path}`, body);
      await refreshSnapshot();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  };

  const s = snap.status;
  const live = s === "running" || s === "accelerated";
  const hasLot = !!snap.lot;
  const mainDone = s === "running" && snap.queued_count === 0 && !hasLot;
  const canAccelerate = mainDone && snap.settings.accelerated_enabled && snap.unsold_pool.length > 0;
  const nominationCount = new Set(Object.values(snap.nominations).flat()).size;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gavel/25 bg-gavel/[.04] p-2.5">
      <span className="px-2 font-display text-xs font-bold uppercase tracking-[.2em] text-gavel">Auctioneer</span>
      {s === "not_started" && (
        <Button variant="primary" onClick={() => run("start", "start", undefined, "Start the auction? The rules lock once it begins.")} disabled={!!busy}>
          <Play size={16} /> Start auction
        </Button>
      )}
      {live && (
        <Button onClick={() => run("pause", "pause")} disabled={!!busy}>
          <Pause size={16} /> Pause
        </Button>
      )}
      {s === "paused" && (
        <Button variant="primary" onClick={() => run("resume", "resume")} disabled={!!busy}>
          <Play size={16} /> Resume
        </Button>
      )}
      {live && !hasLot && snap.queued_count > 0 && (
        <>
          <Button variant="primary" onClick={() => run("next", "next", { mode: "order" })} disabled={!!busy}>
            <SkipForward size={16} /> Next player
          </Button>
          <Button variant="outline" onClick={() => run("next", "next", { mode: "random" })} disabled={!!busy}>
            <Shuffle size={16} /> Random
          </Button>
        </>
      )}
      {hasLot && (
        <>
          <Button variant="primary" onClick={() => run("hammer", "hammer", undefined, snap.lot?.high_bid ? "Hammer now and sell to the high bidder?" : "Close this lot as unsold now?")} disabled={!!busy}>
            <Gavel size={16} /> Hammer now
          </Button>
          <Button variant="outline" onClick={() => run("extend", "extend", { seconds: 10 })} disabled={!!busy}>
            <Plus size={16} /> 10 s
          </Button>
        </>
      )}
      {canAccelerate && (
        <Button
          variant="primary"
          onClick={() => run("acc", "accelerated/start", undefined, `Start the accelerated round with ${nominationCount} nominated player(s)?`)}
          disabled={!!busy || nominationCount === 0}
          title={nominationCount === 0 ? "Waiting for owners to nominate" : undefined}
        >
          <Zap size={16} /> Accelerated round ({nominationCount})
        </Button>
      )}
      <div className="ml-auto flex flex-wrap gap-2">
        {s !== "not_started" && !hasLot && snap.teams.some((t) => t.squad_size > 0) && (
          <Button variant="ghost" onClick={() => run("undo", "undo-sale", undefined, "Undo the last sale? The price is refunded and the player goes back to the front of the queue.")} disabled={!!busy}>
            <Undo2 size={16} /> Undo last sale
          </Button>
        )}
        {s !== "not_started" && s !== "finished" && (
          <Button variant="danger" size="md" onClick={() => run("end", "end", undefined, "End the auction now?")} disabled={!!busy}>
            {mainDone ? <FastForward size={16} /> : <Square size={14} />} {mainDone ? "Skip & end" : "End"}
          </Button>
        )}
      </div>
    </div>
  );
}
