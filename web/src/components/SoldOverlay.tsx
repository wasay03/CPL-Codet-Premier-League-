import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import { useAuction } from "../realtime/auctionStore";
import { TeamLogo } from "./ui";

export function SoldOverlay() {
  const overlay = useAuction((s) => s.overlay);
  const clear = useAuction((s) => s.clearOverlay);
  const snap = useAuction((s) => s.snap);

  useEffect(() => {
    if (!overlay) return;
    const id = window.setTimeout(clear, 3000);
    return () => window.clearTimeout(id);
  }, [overlay, clear]);

  const team = snap?.teams.find((t) => t.id === overlay?.teamId);
  const dropTier = snap?.tiers.find((t) => t.id === overlay?.droppedToTierId);

  return (
    <AnimatePresence>
      {overlay && (
        <motion.div
          key={overlay.key}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={clear}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/85 p-6 backdrop-blur-md"
        >
          <motion.div
            initial={{ scale: 0.6, rotate: -6, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 18 }}
            className="text-center"
          >
            {overlay.result === "sold" ? (
              <>
                <div className="font-display text-[22vw] font-black leading-none tracking-tight text-gavel drop-shadow-[0_0_40px_rgba(245,179,1,.5)] sm:text-[160px]">SOLD</div>
                <div className="mt-4 font-display text-3xl font-bold text-white sm:text-4xl">{overlay.playerName}</div>
                <div className="mt-4 flex items-center justify-center gap-3 text-xl text-slate-200">
                  {team && <TeamLogo team={team} size={44} />}
                  <span>
                    to <b style={{ color: team?.color }}>{team?.name}</b> for{" "}
                    <b className="font-display text-3xl text-gavel">{overlay.price}</b>
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="font-display text-[18vw] font-black leading-none tracking-tight text-slate-400 sm:text-[130px]">UNSOLD</div>
                <div className="mt-4 font-display text-3xl font-bold text-white">{overlay.playerName}</div>
                <div className="mt-3 text-lg text-slate-300">
                  {overlay.toPool ? "Moves to the unsold pool" : `Drops to ${dropTier?.name ?? "the next tier"}`}
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
