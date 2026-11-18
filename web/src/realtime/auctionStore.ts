import { create } from "zustand";
import type { Snapshot } from "../api/types";

export interface FeedItem {
  id: string;
  at: number;
  kind: "bid" | "sold" | "unsold" | "info" | "undo";
  text: string;
  teamId?: number | null;
}

export interface Overlay {
  key: number;
  result: "sold" | "unsold";
  playerName: string;
  teamId?: number;
  price?: number;
  droppedToTierId?: number | null;
  toPool?: boolean;
}

interface AuctionStore {
  snap: Snapshot | null;
  offset: number; // server clock minus local clock, ms
  connected: boolean;
  pendingBid: boolean;
  rejection: { reason: string; at: number } | null;
  overlay: Overlay | null;
  feed: FeedItem[];
  setSnapshot: (s: Snapshot) => void;
  syncClock: (serverNow: number) => void;
  setConnected: (v: boolean) => void;
  setPending: (v: boolean) => void;
  reject: (reason: string) => void;
  showOverlay: (o: Omit<Overlay, "key">) => void;
  clearOverlay: () => void;
  pushFeed: (item: Omit<FeedItem, "id" | "at">) => void;
  reset: () => void;
}

let seq = 0;

export const useAuction = create<AuctionStore>((set, get) => ({
  snap: null,
  offset: 0,
  connected: false,
  pendingBid: false,
  rejection: null,
  overlay: null,
  feed: [],
  setSnapshot: (s) => {
    const cur = get().snap;
    if (cur && s.version < cur.version) return; // stale snapshot
    set({ snap: s });
    get().syncClock(s.server_now);
  },
  syncClock: (serverNow) => set({ offset: serverNow - Date.now() }),
  setConnected: (v) => set({ connected: v }),
  setPending: (v) => set({ pendingBid: v }),
  reject: (reason) => set({ pendingBid: false, rejection: { reason, at: Date.now() } }),
  showOverlay: (o) => set({ overlay: { ...o, key: ++seq } }),
  clearOverlay: () => set({ overlay: null }),
  pushFeed: (item) =>
    set((st) => ({ feed: [{ ...item, id: `f${++seq}`, at: Date.now() }, ...st.feed].slice(0, 60) })),
  reset: () => set({ snap: null, connected: false, pendingBid: false, rejection: null, overlay: null, feed: [] }),
}));

export const serverNow = () => Date.now() + useAuction.getState().offset;
