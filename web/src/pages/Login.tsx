import { Gavel } from "lucide-react";
import { useState } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../api/client";
import type { Me } from "../api/types";
import { Button, Field, Input } from "../components/ui";
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
    <div className="flex min-h-screen items-center justify-center bg-ink-950 bg-[radial-gradient(ellipse_at_top,rgba(245,179,1,.14),transparent_60%)] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gavel text-ink-950 shadow-glow">
            <Gavel size={32} strokeWidth={2.5} />
          </div>
          <h1 className="font-display text-4xl font-black uppercase tracking-wider">Codet Premier League</h1>
          <p className="mt-1 font-display text-lg uppercase tracking-[.3em] text-gavel">Player Auction</p>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-ink-700 bg-ink-850/90 p-6">
          <Field label="Username">
            <Input autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
          </Field>
          <Field label="Password">
            <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <Button variant="primary" className="w-full" size="lg" disabled={busy}>
            {busy ? "Signing in…" : "Enter the room"}
          </Button>
        </form>
      </div>
    </div>
  );
}
