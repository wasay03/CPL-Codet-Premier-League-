import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import { useAuction } from "../realtime/auctionStore";
import { TeamLogo } from "./ui";
import { pkr } from "../lib/money";

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
  const sold = overlay?.result === "sold";

  return (
    <AnimatePresence>
      {overlay && (
        // Always a dark "stage", regardless of theme, so the moment pops.
        <motion.div
          key={overlay.key}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={clear}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#12082b]/95 p-6 backdrop-blur-md"
          style={{
            backgroundImage: sold
              ? `radial-gradient(700px 400px at 50% 40%, ${team?.color ?? "#7c3aed"}55, transparent 70%)`
              : "radial-gradient(700px 400px at 50% 40%, #7c3aed33, transparent 70%)",
          }}
        >
          <motion.div
            initial={{ scale: 0.6, rotate: -6, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 18 }}
            className="text-center"
          >
            {sold ? (
              <>
                <div className="bg-gradient-to-b from-[#ffe08a] to-[#e3a21a] bg-clip-text px-[.12em] font-display text-[22vw] font-black italic leading-none tracking-tight text-transparent drop-shadow-[0_8px_40px_rgba(227,162,26,.45)] sm:text-[160px]">
                  SOLD
                </div>
                <div className="mt-4 font-display text-3xl font-bold text-white sm:text-4xl">{overlay.playerName}</div>
                <div className="mt-5 inline-flex items-center justify-center gap-3 rounded-full bg-white/10 py-2 pl-2 pr-5 text-xl text-white/85 ring-1 ring-white/15">
                  {team && <TeamLogo team={team} size={40} />}
                  <span>
                    to <b className="text-white">{team?.name}</b> for <b className="font-display text-3xl text-[#f5c242]">{pkr(overlay.price)}</b>
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="font-display text-[18vw] font-black italic leading-none tracking-tight text-white/40 sm:text-[130px]">UNSOLD</div>
                <div className="mt-4 font-display text-3xl font-bold text-white">{overlay.playerName}</div>
                <div className="mt-3 text-lg text-white/70">
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
