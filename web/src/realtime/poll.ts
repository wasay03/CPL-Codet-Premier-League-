/**
 * HTTP polling fallback for hosts that can't keep a WebSocket open (e.g. Vercel).
 * While the socket is down, the client fetches the room snapshot about once a second and
 * derives the feed lines and SOLD / UNSOLD overlays that socket events would have produced.
 */
import type { QueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Snapshot } from "../api/types";
import { useAuction } from "./auctionStore";

export const POLL_MS = 1000;

let queryClient: QueryClient | null = null;
let inFlight: Promise<void> | null = null;
let queued = false;

export function setPollQueryClient(qc: QueryClient) {
  queryClient = qc;
}

const teamName = (s: Snapshot, id: number | null | undefined) => s.teams.find((t) => t.id === id)?.name ?? "a team";
const tierName = (s: Snapshot, id: number | null | undefined) => s.tiers.find((t) => t.id === id)?.name ?? "";

function announceChanges(prev: Snapshot, next: Snapshot) {
  const st = useAuction.getState();
  if (prev.status !== next.status) st.pushFeed({ kind: "info", text: `Auction ${next.status.replace("_", " ")}` });

  const was = prev.lot;
  const now = next.lot;
  if (was && now?.id === was.id && now.high_bid != null && now.high_bid !== was.high_bid) {
    st.pushFeed({ kind: "bid", text: `${teamName(next, now.high_team_id)} bid ${now.high_bid}`, teamId: now.high_team_id });
  }
  if (was && now?.id !== was.id) {
    const closed = next.recent.find((r) => r.id === was.id);
    const name = was.player.name;
    if (closed?.status === "sold") {
      st.showOverlay({ result: "sold", playerName: name, teamId: closed.team_id ?? undefined, price: closed.price ?? undefined });
      st.pushFeed({ kind: "sold", text: `${name} SOLD to ${teamName(next, closed.team_id)} for ${closed.price}`, teamId: closed.team_id });
    } else if (closed?.status === "unsold") {
      st.showOverlay({ result: "unsold", playerName: name, droppedToTierId: closed.dropped_to_tier_id, toPool: closed.to_pool });
      st.pushFeed({
        kind: "unsold",
        text: closed.to_pool ? `${name} unsold — to the pool` : `${name} unsold — drops to ${tierName(next, closed.dropped_to_tier_id)}`,
      });
    }
    queryClient?.invalidateQueries({ queryKey: ["history"] });
  }
  if (now && now.id !== was?.id) {
    st.pushFeed({ kind: "info", text: `${now.player.name} is on the block at ${now.opening_price}` });
  }
}

async function fetchOnce(): Promise<void> {
  try {
    const next = await api.get<Snapshot>("/auction/state");
    const st = useAuction.getState();
    if (st.connected) return; // the socket came up while we waited
    const prev = st.snap;
    if (prev && next.version > prev.version) announceChanges(prev, next);
    st.setSnapshot(next);
    st.setPolling(true);
  } catch {
    useAuction.getState().setPolling(false);
  }
}

/**
 * Fetch the snapshot now unless the WebSocket is live. If a fetch is already running it may
 * predate the caller's action, so one more fetch is queued after it (extra callers share it).
 */
export async function refreshSnapshot(): Promise<void> {
  if (useAuction.getState().connected) return;
  if (inFlight) {
    queued = true;
    await inFlight;
    if (!queued) return inFlight ?? undefined;
  }
  queued = false;
  inFlight = fetchOnce().finally(() => {
    inFlight = null;
  });
  return inFlight;
}
