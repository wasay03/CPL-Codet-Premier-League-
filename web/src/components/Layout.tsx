import clsx from "clsx";
import { CheckCircle2, Info, LogOut, Menu, Moon, Sun, Wifi, WifiOff, X, XCircle } from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useSession } from "../lib/session";
import { useTheme } from "../lib/theme";
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

export function BrandMark({ compact }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <img src="/logo-192.webp" alt="Codet Premier League" width={40} height={40} className="h-10 w-10 object-contain" />
      {!compact && (
        <span className="leading-none">
          <span className="block font-display text-[17px] font-extrabold italic tracking-tight text-fg">
            CPL <span className="text-brand-ink">Auction</span>
          </span>
          <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[.16em] text-muted">Codet Premier League</span>
        </span>
      )}
    </span>
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useTheme((s) => s.theme);
  const toggle = useTheme((s) => s.toggle);
  return (
    <button
      onClick={toggle}
      className={clsx("rounded-xl p-2 text-muted transition-colors hover:bg-well hover:text-fg", className)}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      aria-label="Toggle theme"
    >
      {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

export function Layout() {
  useAuctionSocket();
  const me = useSession((s) => s.me);
  const logout = useSession((s) => s.logout);
  const connected = useAuction((s) => s.connected);
  const polling = useAuction((s) => s.polling);
  const status = useAuction((s) => s.snap?.status);
  const [open, setOpen] = useState(false);
  const links = me?.role === "admin" ? [...LINKS, ...ADMIN_LINKS] : LINKS;
  const live = status === "running" || status === "accelerated";

  const nav = (cls: string) =>
    links.map((l) => (
      <NavLink
        key={l.to}
        to={l.to}
        onClick={() => setOpen(false)}
        className={({ isActive }) =>
          clsx(cls, "transition-colors", isActive ? "bg-brand-soft text-brand-ink" : "text-muted hover:bg-well hover:text-fg")
        }
      >
        {l.label}
      </NavLink>
    ));

  return (
    <div className="min-h-screen bg-canvas bg-[radial-gradient(1200px_420px_at_50%_-120px,rgb(var(--brand)/.10),transparent)]">
      <header className="sticky top-0 z-40 border-b border-line/80 bg-surface/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
          <NavLink to="/room" className="shrink-0">
            <BrandMark />
          </NavLink>
          <nav className="hidden flex-1 items-center gap-1 lg:flex">{nav("rounded-xl px-3.5 py-2 text-sm font-semibold")}</nav>
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            {status && (
              <span
                className={clsx(
                  "hidden items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold sm:inline-flex",
                  live ? "bg-ok/10 text-ok ring-1 ring-inset ring-ok/20" : "bg-well text-fg-2 ring-1 ring-inset ring-line",
                )}
              >
                {live && (
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-ok" />
                  </span>
                )}
                {STATUS_LABEL[status]}
              </span>
            )}
            <span
              title={connected ? "Live (WebSocket)" : polling ? "Live (updates every second)" : "Reconnecting…"}
              className={clsx("p-1.5", connected ? "text-ok" : polling ? "text-warn" : "text-danger")}
            >
              {connected || polling ? <Wifi size={17} /> : <WifiOff size={17} />}
            </span>
            <ThemeToggle />
            <NavLink
              to="/profile"
              className={({ isActive }) =>
                clsx("flex items-center gap-2 rounded-full p-0.5 pr-0.5 transition-colors hover:bg-well md:pr-3", isActive && "bg-brand-soft")
              }
            >
              <Avatar name={me?.display_name ?? "?"} imageId={me?.avatar_image_id} size={32} />
              <span className="hidden text-sm font-semibold text-fg-2 md:inline">{me?.display_name}</span>
            </NavLink>
            <button onClick={logout} className="hidden rounded-xl p-2 text-muted hover:bg-well hover:text-danger sm:block" title="Log out">
              <LogOut size={17} />
            </button>
            <button onClick={() => setOpen(!open)} className="rounded-xl p-2 text-fg-2 hover:bg-well lg:hidden" aria-label="Menu">
              {open ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
        {open && (
          <nav className="flex flex-col gap-1 border-t border-line bg-surface px-4 py-3 lg:hidden">
            {nav("rounded-xl px-3 py-2.5 text-sm font-semibold")}
            <button onClick={logout} className="rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-danger hover:bg-danger/10">
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

const TOAST_ICON = { ok: CheckCircle2, error: XCircle, info: Info } as const;

function Toasts() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex w-[min(92vw,400px)] -translate-x-1/2 flex-col gap-2">
      {toasts.map((t) => {
        const Icon = TOAST_ICON[t.tone];
        return (
          <div
            key={t.id}
            className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-line bg-surface/95 px-4 py-3 text-sm font-medium text-fg shadow-pop backdrop-blur"
          >
            <Icon
              size={18}
              className={clsx("mt-px shrink-0", t.tone === "error" && "text-danger", t.tone === "ok" && "text-ok", t.tone === "info" && "text-brand")}
            />
            <span>{t.text}</span>
          </div>
        );
      })}
    </div>
  );
}
