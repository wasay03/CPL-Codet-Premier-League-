import clsx from "clsx";
import { Gavel } from "lucide-react";
import { useEffect } from "react";
import { api } from "../api/client";
import type { Snapshot } from "../api/types";
import { bidBlockReason, REJECTION_TEXT } from "../lib/rules";
import { useSession } from "../lib/session";
import { toast } from "../lib/toast";
import { useAuction } from "../realtime/auctionStore";
import { refreshSnapshot } from "../realtime/poll";
import { sendBid } from "../realtime/useAuctionSocket";
import { Spinner } from "./ui";

export function BidPanel({ snap, msLeft }: { snap: Snapshot; msLeft: number }) {
  const me = useSession((s) => s.me);
  const pending = useAuction((s) => s.pendingBid);
  const setPending = useAuction((s) => s.setPending);
  const rejection = useAuction((s) => s.rejection);
  const team = snap.teams.find((t) => t.id === me?.team_id);
  const reason = bidBlockReason(snap, team, msLeft);
  const lot = snap.lot;

  useEffect(() => {
    if (rejection) toast.error(REJECTION_TEXT[rejection.reason] ?? rejection.reason);
  }, [rejection]);

  // Safety net: never leave the spinner stuck if no reply arrives.
  useEffect(() => {
    if (!pending) return;
    const id = window.setTimeout(() => setPending(false), 4000);
    return () => window.clearTimeout(id);
  }, [pending, setPending]);

  const bid = async () => {
    if (!lot || reason || pending) return;
    if (!sendBid(lot.id, lot.next_bid)) {
      // Socket down: fall back to REST, which runs the same engine function.
      setPending(true);
      try {
        await api.post("/auction/bid", { lot_id: lot.id, amount: lot.next_bid });
        await refreshSnapshot();
      } catch (e) {
        toast.error(REJECTION_TEXT[(e as Error).message] ?? e);
        void refreshSnapshot(); // show the newer price that beat us
      } finally {
        setPending(false);
      }
    }
  };

  return (
    <div className="sticky bottom-0 z-30 -mx-4 border-t border-ink-700 bg-ink-900/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:rounded-2xl sm:border sm:bg-ink-850/90 sm:p-4">
      <div className="flex items-center gap-4">
        <div className="hidden min-w-0 flex-1 sm:block">
          <div className="text-xs uppercase tracking-wider text-slate-500">Your purse · max bid</div>
          <div className="font-display text-2xl font-bold tabular-nums">
            {team?.purse_remaining ?? "—"} <span className="text-slate-500">·</span> <span className="text-gavel">{team?.max_bid ?? "—"}</span>
          </div>
        </div>
        <div className="flex-1 sm:flex-none">
          <button
            onClick={bid}
            disabled={!!reason || pending}
            className={clsx(
              "flex h-16 w-full items-center justify-center gap-3 rounded-2xl px-8 font-display text-3xl font-extrabold uppercase tracking-wide transition-all sm:min-w-[300px]",
              reason ? "cursor-not-allowed bg-ink-700 text-slate-500" : "bg-gavel text-ink-950 shadow-glow hover:bg-gavel-soft active:scale-[.97]",
            )}
          >
            {pending ? <Spinner className="h-6 w-6" /> : <Gavel size={26} strokeWidth={2.5} />}
            {lot ? `Bid ${lot.next_bid}` : "Bid"}
          </button>
          <div className={clsx("mt-1.5 h-4 text-center text-xs font-medium", reason ? "text-slate-400" : "text-emerald-400")}>
            {reason ?? `Max bid ${team?.max_bid} · ${Math.ceil(msLeft / 1000)}s left`}
          </div>
        </div>
      </div>
    </div>
  );
}
