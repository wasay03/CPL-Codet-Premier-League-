import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import type { Snapshot } from "../api/types";
import { useSession } from "../lib/session";
import { useAuction } from "./auctionStore";

type Msg = { type: string; version: number; data: any };

let activeSocket: WebSocket | null = null;

export function sendBid(lotId: number, amount: number): boolean {
  if (!activeSocket || activeSocket.readyState !== WebSocket.OPEN) return false;
  useAuction.getState().setPending(true);
  activeSocket.send(JSON.stringify({ type: "bid", data: { lot_id: lotId, amount } }));
  return true;
}

function teamName(snap: Snapshot | null, id: number | null | undefined) {
  return snap?.teams.find((t) => t.id === id)?.name ?? "a team";
}
function tierName(snap: Snapshot | null, id: number | null | undefined) {
  return snap?.tiers.find((t) => t.id === id)?.name ?? "";
}

/** One socket per signed-in browser tab. Reconnects with 1, 2, 4 … 10 s backoff; pings every 20 s. */
export function useAuctionSocket() {
  const token = useSession((s) => s.token);
  const mustChange = useSession((s) => s.me?.must_change_password);
  const logout = useSession((s) => s.logout);
  const qc = useQueryClient();
  const retry = useRef(0);

  useEffect(() => {
    if (!token || mustChange) return;
    let ws: WebSocket | null = null;
    let pingTimer: number | undefined;
    let retryTimer: number | undefined;
    let stopped = false;
    const store = useAuction.getState;

    const handle = (msg: Msg) => {
      const st = store();
      const snap = st.snap;
      switch (msg.type) {
        case "state":
          st.setSnapshot(msg.data as Snapshot);
          break;
        case "pong":
          st.syncClock(msg.data.server_now);
          break;
        case "lot_opened":
          st.syncClock(msg.data.server_now);
          st.pushFeed({ kind: "info", text: `${msg.data.player.name} is on the block at ${msg.data.opening_price}` });
          break;
        case "bid_placed":
          st.syncClock(msg.data.server_now);
          if (msg.data.user_id === useSession.getState().me?.id) st.setPending(false);
          st.pushFeed({ kind: "bid", text: `${teamName(snap, msg.data.team_id)} bid ${msg.data.amount}`, teamId: msg.data.team_id });
          break;
        case "bid_rejected":
          st.reject(msg.data.reason);
          break;
        case "lot_closed": {
          const d = msg.data;
          const name = d.player?.name ?? "Player";
          if (d.result === "sold") {
            st.showOverlay({ result: "sold", playerName: name, teamId: d.team_id, price: d.price });
            st.pushFeed({ kind: "sold", text: `${name} SOLD to ${teamName(snap, d.team_id)} for ${d.price}`, teamId: d.team_id });
          } else {
            st.showOverlay({ result: "unsold", playerName: name, droppedToTierId: d.dropped_to_tier_id, toPool: d.to_pool });
            st.pushFeed({
              kind: "unsold",
              text: d.to_pool ? `${name} unsold — to the pool` : `${name} unsold — drops to ${tierName(snap, d.dropped_to_tier_id)}`,
            });
          }
          qc.invalidateQueries({ queryKey: ["history"] });
          break;
        }
        case "sale_undone":
          st.pushFeed({ kind: "undo", text: `Sale undone: ${msg.data.player_name} (${msg.data.price}) back to the queue` });
          qc.invalidateQueries({ queryKey: ["history"] });
          break;
        case "auction_status":
          st.pushFeed({ kind: "info", text: `Auction ${String(msg.data.status).replace("_", " ")}` });
          break;
        case "settings_updated":
          qc.invalidateQueries();
          break;
      }
    };

    const connect = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(token)}`);
      activeSocket = ws;
      ws.onopen = () => {
        retry.current = 0;
        store().setConnected(true);
        pingTimer = window.setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send('{"type":"ping","data":{}}'), 20000);
        ws?.send('{"type":"ping","data":{}}');
      };
      ws.onmessage = (ev) => {
        try {
          handle(JSON.parse(ev.data));
        } catch (e) {
          console.error("bad message", e);
        }
      };
      ws.onclose = (ev) => {
        window.clearInterval(pingTimer);
        store().setConnected(false);
        store().setPending(false);
        if (activeSocket === ws) activeSocket = null;
        if (stopped) return;
        if (ev.code === 4401) {
          logout();
          return;
        }
        const delay = Math.min(10000, 1000 * 2 ** retry.current);
        retry.current += 1;
        retryTimer = window.setTimeout(connect, delay);
      };
    };

    connect();
    const onVisible = () => {
      if (document.visibilityState === "visible" && ws?.readyState === WebSocket.OPEN) ws.send('{"type":"sync","data":{}}');
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(pingTimer);
      window.clearTimeout(retryTimer);
      ws?.close();
      store().reset();
    };
  }, [token, mustChange, logout, qc]);
}
