import clsx from "clsx";
import { X } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { imageUrl } from "../api/client";
import type { Team, Tier } from "../api/types";
import { fmtM } from "../lib/money";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg" }>(
  ({ className, variant = "secondary", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-150 select-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        "disabled:cursor-not-allowed disabled:opacity-45 active:scale-[.98] disabled:active:scale-100",
        size === "sm" && "h-8 px-3 text-xs",
        size === "md" && "h-10 px-4 text-sm",
        size === "lg" && "h-12 px-6 text-base",
        variant === "primary" && "bg-brand text-white shadow-sm shadow-brand/30 hover:bg-brand-strong",
        variant === "secondary" && "bg-well text-fg hover:bg-well-2",
        variant === "outline" && "border border-line-strong bg-surface text-fg-2 hover:border-brand/50 hover:text-brand-ink",
        variant === "ghost" && "text-fg-2 hover:bg-well hover:text-fg",
        variant === "danger" && "bg-danger text-white hover:bg-danger/90",
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx("rounded-2xl border border-line bg-surface shadow-card", className)} {...rest}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-base font-bold tracking-tight text-fg">{children}</h2>
      {right}
    </div>
  );
}

/** Small uppercase label used above numbers and table headers. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("text-[11px] font-semibold uppercase tracking-[.12em] text-muted", className)}>{children}</div>;
}

const fieldBase =
  "h-10 w-full rounded-xl border border-line-strong bg-surface px-3 text-sm text-fg placeholder:text-faint transition-colors " +
  "hover:border-brand/40 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15 disabled:bg-well disabled:opacity-70";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={clsx(fieldBase, className)} {...props} />
));
Input.displayName = "Input";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => (
  <select ref={ref} className={clsx(fieldBase, "pr-8", className)} {...props}>
    {children}
  </select>
));
Select.displayName = "Select";

export const textareaClass = clsx(fieldBase, "h-auto py-2");

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold text-fg-2">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}

const TIER_STYLE: Record<string, string> = {
  platinum: "bg-indigo-100 text-indigo-700 ring-indigo-200 dark:bg-indigo-400/15 dark:text-indigo-200 dark:ring-indigo-400/25",
  diamond: "bg-sky-100 text-sky-700 ring-sky-200 dark:bg-sky-400/15 dark:text-sky-200 dark:ring-sky-400/25",
  gold: "bg-amber-100 text-amber-800 ring-amber-200 dark:bg-amber-400/15 dark:text-amber-200 dark:ring-amber-400/25",
  silver: "bg-zinc-100 text-zinc-700 ring-zinc-200 dark:bg-zinc-400/15 dark:text-zinc-200 dark:ring-zinc-400/25",
  emerging: "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-400/15 dark:text-emerald-200 dark:ring-emerald-400/25",
};
const TIER_DOT: Record<string, string> = {
  platinum: "bg-indigo-500",
  diamond: "bg-sky-500",
  gold: "bg-amber-500",
  silver: "bg-zinc-400",
  emerging: "bg-emerald-500",
};
const TIER_TEXT: Record<string, string> = {
  platinum: "text-indigo-600 dark:text-indigo-300",
  diamond: "text-sky-600 dark:text-sky-300",
  gold: "text-amber-600 dark:text-amber-300",
  silver: "text-zinc-500 dark:text-zinc-300",
  emerging: "text-emerald-600 dark:text-emerald-300",
};
export const tierText = (t?: Tier) => (t ? TIER_TEXT[t.key] ?? "text-fg-2" : "text-fg-2");

export function TierBadge({ tier, size = "sm" }: { tier?: Tier; size?: "sm" | "md" }) {
  if (!tier) return null;
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full font-semibold ring-1 ring-inset",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-3 py-1 text-xs",
        TIER_STYLE[tier.key] ?? "bg-well text-fg-2 ring-line",
      )}
    >
      <span className={clsx("h-1.5 w-1.5 rounded-full", TIER_DOT[tier.key] ?? "bg-muted")} />
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
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: src ? undefined : color ?? "linear-gradient(135deg, #8b5cf6, #4c1d95)",
      }}
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
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface font-display font-extrabold text-white ring-1 ring-black/5 dark:ring-white/10"
      style={{ width: size, height: size, fontSize: size * 0.34, background: src ? undefined : team.color }}
    >
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : team.short_code}
    </span>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-brand-deep/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        className={clsx(
          "max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-line bg-surface p-6 shadow-pop sm:rounded-3xl",
          wide ? "sm:max-w-2xl" : "sm:max-w-md",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-bold tracking-tight">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-well hover:text-fg" aria-label="Close">
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
    <div className="rounded-xl bg-well/70 px-4 py-3">
      <Eyebrow>{label}</Eyebrow>
      <div className={clsx("mt-0.5 font-display text-2xl font-bold tabular-nums", accent ? "text-brand-ink" : "text-fg")}>{value}</div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-line-strong bg-well/40 p-8 text-center text-sm text-muted">{children}</div>;
}

export function Spinner({ className }: { className?: string }) {
  return <span className={clsx("inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent", className)} />;
}

export function Page({ title, subtitle, actions, children }: { title: string; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-[2.1rem]">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}

/** A rupee amount for big number displays: small "Rs", the figure, small "M". */
export function Money({ value, className }: { value: number | null | undefined; className?: string }) {
  if (value == null) return <span className={className}>—</span>;
  const figure = fmtM(value).slice(0, -1);
  return (
    <span className={clsx("whitespace-nowrap tabular-nums", className)}>
      <span className="mr-[.15em] text-[.5em] font-semibold opacity-60">Rs</span>
      {figure}
      <span className="ml-[.05em] text-[.6em]">M</span>
    </span>
  );
}

/** Segmented control used for in-page tabs. */
export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, ReactNode][] }) {
  return (
    <div className="inline-flex rounded-xl border border-line bg-well p-1">
      {options.map(([k, label]) => (
        <button
          key={k}
          onClick={() => onChange(k)}
          className={clsx(
            "rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-all",
            value === k ? "bg-surface text-brand-ink shadow-sm" : "text-muted hover:text-fg",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** Table header cell. */
export const th = "px-4 py-3 text-[11px] font-semibold uppercase tracking-[.1em] text-muted";
