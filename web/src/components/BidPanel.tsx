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
import { Eyebrow, Money, Spinner } from "./ui";
import { pkr } from "../lib/money";

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
    <div className="sticky bottom-0 z-30 -mx-4 border-t border-line bg-surface/90 px-4 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-3 shadow-pop backdrop-blur-xl sm:static sm:mx-0 sm:rounded-2xl sm:border sm:bg-surface sm:p-4 sm:shadow-card">
      <div className="flex items-center gap-5">
        <div className="hidden min-w-0 flex-1 gap-6 sm:flex">
          <div>
            <Eyebrow>Your purse</Eyebrow>
            <Money value={team?.purse_remaining} className="font-display text-3xl font-bold" />
          </div>
          <div className="w-px bg-line" />
          <div>
            <Eyebrow>Max bid</Eyebrow>
            <Money value={team?.max_bid} className="font-display text-3xl font-bold text-brand-ink" />
          </div>
        </div>
        <div className="flex-1 sm:flex-none">
          <button
            onClick={bid}
            disabled={!!reason || pending}
            className={clsx(
              "flex h-16 w-full items-center justify-center gap-3 rounded-2xl px-8 font-display text-2xl font-bold tracking-tight transition-all sm:min-w-[300px]",
              reason
                ? "cursor-not-allowed bg-well text-faint"
                : "bg-gradient-to-r from-brand to-brand-strong text-white shadow-glow hover:brightness-110 active:scale-[.97]",
            )}
          >
            {pending ? <Spinner className="h-6 w-6" /> : <Gavel size={24} strokeWidth={2.4} />}
            {lot ? `Bid ${pkr(lot.next_bid)}` : "Bid"}
          </button>
          <div className={clsx("mt-1.5 h-4 text-center text-xs font-semibold", reason ? "text-muted" : "text-ok")}>
            {reason ?? `Max bid ${pkr(team?.max_bid)} · ${Math.ceil(msLeft / 1000)}s left`}
          </div>
        </div>
      </div>
    </div>
  );
}
