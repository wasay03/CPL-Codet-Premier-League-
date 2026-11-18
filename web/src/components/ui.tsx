import clsx from "clsx";
import { X } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { imageUrl } from "../api/client";
import type { Team, Tier } from "../api/types";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg" }>(
  ({ className, variant = "secondary", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-all select-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gavel/70 disabled:cursor-not-allowed disabled:opacity-40",
        size === "sm" && "h-8 px-3 text-xs",
        size === "md" && "h-10 px-4 text-sm",
        size === "lg" && "h-14 px-6 text-lg",
        variant === "primary" && "bg-gavel text-ink-950 hover:bg-gavel-soft active:scale-[.98]",
        variant === "secondary" && "bg-ink-700 text-slate-100 hover:bg-ink-600",
        variant === "outline" && "border border-ink-600 text-slate-200 hover:border-gavel/60 hover:text-white",
        variant === "ghost" && "text-slate-300 hover:bg-ink-700/60 hover:text-white",
        variant === "danger" && "bg-rose-600/90 text-white hover:bg-rose-500",
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx("rounded-2xl border border-ink-700/80 bg-ink-850/90 shadow-lg shadow-black/20", className)} {...rest}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="font-display text-sm font-semibold uppercase tracking-[.18em] text-slate-400">{children}</h2>
      {right}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={clsx(
      "h-10 w-full rounded-lg border border-ink-600 bg-ink-900 px-3 text-sm text-slate-100 placeholder:text-slate-500",
      "focus:border-gavel/70 focus:outline-none focus:ring-1 focus:ring-gavel/50 disabled:opacity-60",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={clsx(
      "h-10 w-full rounded-lg border border-ink-600 bg-ink-900 px-3 text-sm text-slate-100 focus:border-gavel/70 focus:outline-none disabled:opacity-60",
      className,
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

const TIER_STYLE: Record<string, string> = {
  platinum: "bg-gradient-to-r from-slate-200 to-indigo-200 text-ink-950",
  diamond: "bg-gradient-to-r from-cyan-300 to-sky-400 text-ink-950",
  gold: "bg-gradient-to-r from-amber-300 to-yellow-500 text-ink-950",
  silver: "bg-gradient-to-r from-zinc-300 to-zinc-400 text-ink-950",
  emerging: "bg-gradient-to-r from-emerald-300 to-lime-300 text-ink-950",
};
const TIER_TEXT: Record<string, string> = {
  platinum: "text-indigo-200",
  diamond: "text-cyan-300",
  gold: "text-amber-300",
  silver: "text-zinc-300",
  emerging: "text-emerald-300",
};
export const tierText = (t?: Tier) => (t ? TIER_TEXT[t.key] ?? "text-slate-300" : "text-slate-300");

export function TierBadge({ tier, size = "sm" }: { tier?: Tier; size?: "sm" | "md" }) {
  if (!tier) return null;
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-md font-display font-bold uppercase tracking-wider",
        size === "sm" ? "px-1.5 py-0.5 text-[11px]" : "px-2.5 py-1 text-sm",
        TIER_STYLE[tier.key] ?? "bg-slate-300 text-ink-950",
      )}
    >
      {tier.name}
    </span>
  );
}

export function initials(name: string) {
  return name
    .replace(/\(\?\)/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

export function Avatar({ name, imageId, size = 40, color, className }: { name: string; imageId?: number | null; size?: number; color?: string; className?: string }) {
  const src = imageUrl(imageId);
  return (
    <span
      className={clsx("relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-display font-bold text-white", className)}
      style={{ width: size, height: size, fontSize: size * 0.4, background: src ? undefined : color ?? "#2a3354" }}
    >
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : initials(name)}
    </span>
  );
}

export function TeamLogo({ team, size = 40 }: { team?: Pick<Team, "name" | "short_code" | "color" | "logo_image_id">; size?: number }) {
  if (!team) return null;
  const src = imageUrl(team.logo_image_id);
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl font-display font-extrabold text-white ring-1 ring-white/10"
      style={{ width: size, height: size, fontSize: size * 0.36, background: src ? "#0a0e1a" : team.color }}
    >
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : team.short_code}
    </span>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        className={clsx("max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-ink-600 bg-ink-850 p-5 sm:rounded-2xl", wide ? "sm:max-w-2xl" : "sm:max-w-md")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-xl font-bold tracking-wide">{title}</h3>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-ink-700 hover:text-white" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Stat({ label, value, accent }: { label: string; value: ReactNode; accent?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-[.16em] text-slate-500">{label}</div>
      <div className={clsx("font-display text-xl font-bold tabular-nums", accent ? "text-gavel" : "text-slate-100")}>{value}</div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-ink-600 p-6 text-center text-sm text-slate-500">{children}</div>;
}

export function Spinner({ className }: { className?: string }) {
  return <span className={clsx("inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent", className)} />;
}

export function Page({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-3xl font-extrabold uppercase tracking-wide sm:text-4xl">{title}</h1>
        {actions}
      </div>
      {children}
    </div>
  );
}
