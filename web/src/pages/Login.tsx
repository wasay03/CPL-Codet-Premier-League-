import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../api/client";
import type { Me } from "../api/types";
import { ThemeToggle } from "../components/Layout";
import { Button, Field, Input, Spinner } from "../components/ui";
import { useSession } from "../lib/session";

export function LoginPage() {
  const { token, login } = useSession();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (token) return <Navigate to="/room" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ token: string; user: Me }>("/auth/login", { username, password });
      login(res.token, res.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen bg-canvas lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-[#2a0f6b] via-[#3b1499] to-[#160838] lg:flex lg:flex-col lg:items-center lg:justify-center">
        <div className="absolute inset-0 bg-[radial-gradient(600px_400px_at_30%_20%,rgba(167,139,250,.35),transparent),radial-gradient(500px_300px_at_80%_90%,rgba(227,162,26,.18),transparent)]" />
        <div className="absolute inset-0 opacity-[.07] [background-image:linear-gradient(white_1px,transparent_1px),linear-gradient(90deg,white_1px,transparent_1px)] [background-size:44px_44px]" />
        <img src="/logo.webp" alt="Codet Premier League" width={380} height={380} className="relative w-[min(380px,70%)] drop-shadow-[0_30px_60px_rgba(0,0,0,.45)]" />
        <p className="relative mt-6 font-display text-lg font-semibold uppercase italic tracking-[.3em] text-white/80">Player Auction</p>
      </div>

      {/* Form */}
      <div className="relative flex items-center justify-center px-5 py-10">
        <ThemeToggle className="absolute right-4 top-4" />
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center lg:text-left">
            <img src="/logo.webp" alt="Codet Premier League" width={150} height={150} className="mx-auto mb-4 h-[150px] w-[150px] object-contain lg:hidden" />
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-xs font-bold uppercase tracking-[.14em] text-brand-ink">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" /> CPL Auction
            </span>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight">Welcome back</h1>
            <p className="mt-1.5 text-sm text-muted">Sign in to enter the Codet Premier League auction room.</p>
          </div>
          <form onSubmit={submit} className="space-y-4 rounded-3xl border border-line bg-surface p-6 shadow-card">
            <Field label="Username">
              <Input autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
            </Field>
            <Field label="Password">
              <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
            {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{error}</p>}
            <Button variant="primary" className="w-full" size="lg" disabled={busy}>
              {busy ? <Spinner /> : null}
              {busy ? "Signing in…" : "Enter the room"}
              {!busy && <ArrowRight size={18} />}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
