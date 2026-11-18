import { useEffect, useState } from "react";
import { useAuction } from "./auctionStore";

/** Milliseconds left until `endsAt` (server clock), re-rendered at ~10 fps. */
export function useCountdown(endsAt: number | null | undefined, frozenMs?: number | null): number {
  const offset = useAuction((s) => s.offset);
  const calc = () => {
    if (frozenMs != null) return frozenMs;
    if (!endsAt) return 0;
    return Math.max(0, endsAt - (Date.now() + offset));
  };
  const [left, setLeft] = useState(calc);
  useEffect(() => {
    setLeft(calc());
    if (frozenMs != null || !endsAt) return;
    const id = window.setInterval(() => setLeft(calc()), 100);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endsAt, offset, frozenMs]);
  return left;
}
