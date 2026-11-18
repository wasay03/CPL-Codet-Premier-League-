import clsx from "clsx";
import { Gavel, LogOut, Menu, Wifi, WifiOff, X } from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useSession } from "../lib/session";
import { useToasts } from "../lib/toast";
import { useAuction } from "../realtime/auctionStore";
import { useAuctionSocket } from "../realtime/useAuctionSocket";
import { Avatar } from "./ui";

const LINKS = [
  { to: "/room", label: "Auction Room" },
  { to: "/teams", label: "Teams" },
  { to: "/players", label: "Players" },
  { to: "/history", label: "History" },
  { to: "/results", label: "Results" },
];
const ADMIN_LINKS = [
  { to: "/admin/rules", label: "Rules" },
  { to: "/admin/users", label: "Users" },
];

const STATUS_LABEL: Record<string, string> = {
  not_started: "Not started",
  running: "Live",
  paused: "Paused",
  accelerated: "Accelerated",
  finished: "Finished",
};

export function Layout() {
  useAuctionSocket();
  const me = useSession((s) => s.me);
  const logout = useSession((s) => s.logout);
  const connected = useAuction((s) => s.connected);
  const polling = useAuction((s) => s.polling);
  const status = useAuction((s) => s.snap?.status);
  const [open, setOpen] = useState(false);
  const links = me?.role === "admin" ? [...LINKS, ...ADMIN_LINKS] : LINKS;

  const nav = (cls: string) =>
    links.map((l) => (
      <NavLink
        key={l.to}
        to={l.to}
        onClick={() => setOpen(false)}
        className={({ isActive }) =>
          clsx(cls, isActive ? "bg-ink-700 text-white" : "text-slate-400 hover:bg-ink-800 hover:text-slate-100")
        }
      >
        {l.label}
      </NavLink>
    ));

  return (
    <div className="min-h-screen bg-ink-900 bg-[radial-gradient(ellipse_at_top,rgba(245,179,1,.07),transparent_55%)]">
      <header className="sticky top-0 z-40 border-b border-ink-700/80 bg-ink-900/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <NavLink to="/room" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gavel text-ink-950">
              <Gavel size={18} strokeWidth={2.5} />
            </span>
            <span className="font-display text-xl font-extrabold tracking-wider">CPL<span className="text-gavel"> AUCTION</span></span>
          </NavLink>
          <nav className="hidden flex-1 items-center gap-1 lg:flex">{nav("rounded-lg px-3 py-1.5 text-sm font-medium")}</nav>
          <div className="ml-auto flex items-center gap-3">
            {status && (
              <span
                className={clsx(
                  "hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold sm:inline-flex",
                  status === "running" || status === "accelerated" ? "bg-emerald-500/15 text-emerald-300" : "bg-ink-700 text-slate-300",
                )}
              >
                {(status === "running" || status === "accelerated") && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />}
                {STATUS_LABEL[status]}
              </span>
            )}
            <span
              title={connected ? "Live (WebSocket)" : polling ? "Live (updates every second)" : "Reconnecting…"}
              className={connected ? "text-emerald-400" : polling ? "text-amber-400" : "text-rose-400"}
            >
              {connected || polling ? <Wifi size={16} /> : <WifiOff size={16} />}
            </span>
            <NavLink to="/profile" className="flex items-center gap-2 rounded-full pr-1 hover:bg-ink-800">
              <Avatar name={me?.display_name ?? "?"} imageId={me?.avatar_image_id} size={30} />
              <span className="hidden text-sm text-slate-300 md:inline">{me?.display_name}</span>
            </NavLink>
            <button onClick={logout} className="hidden rounded-lg p-2 text-slate-400 hover:bg-ink-800 hover:text-white sm:block" title="Log out">
              <LogOut size={16} />
            </button>
            <button onClick={() => setOpen(!open)} className="rounded-lg p-2 text-slate-300 hover:bg-ink-800 lg:hidden" aria-label="Menu">
              {open ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
        {open && (
          <nav className="flex flex-col gap-1 border-t border-ink-700 px-4 py-3 lg:hidden">
            {nav("rounded-lg px-3 py-2 text-sm font-medium")}
            <button onClick={logout} className="rounded-lg px-3 py-2 text-left text-sm font-medium text-rose-300 hover:bg-ink-800">
              Log out
            </button>
          </nav>
        )}
      </header>
      <main>
        <Outlet />
      </main>
      <Toasts />
    </div>
  );
}

function Toasts() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex w-[min(92vw,380px)] -translate-x-1/2 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={clsx(
            "pointer-events-auto rounded-xl border px-4 py-3 text-sm font-medium shadow-xl backdrop-blur",
            t.tone === "error" && "border-rose-500/40 bg-rose-950/90 text-rose-100",
            t.tone === "ok" && "border-emerald-500/40 bg-emerald-950/90 text-emerald-100",
            t.tone === "info" && "border-ink-500 bg-ink-800/95 text-slate-100",
          )}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
