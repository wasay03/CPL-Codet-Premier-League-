import { Eye, KeyRound } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Me } from "../api/types";
import { Avatar, Button, Card, Field, Input, SectionTitle, TeamLogo } from "../components/ui";
import { useSession } from "../lib/session";
import { toast } from "../lib/toast";
import { useAuction } from "../realtime/auctionStore";

export function ProfilePage() {
  const me = useSession((s) => s.me)!;
  const mustChange = me.must_change_password;
  if (me.role === "viewer") return <ViewerProfile />;
  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Profile</h1>
      {mustChange && (
        <div className="flex items-start gap-3 rounded-xl border border-brand/20 bg-brand-soft p-4 text-sm font-medium text-brand-ink">
          <KeyRound size={18} className="mt-0.5 shrink-0" />
          Welcome! Set a new password before entering the auction room.
        </div>
      )}
      <PasswordCard />
      {!mustChange && <ProfileCard />}
      {!mustChange && me.team_id && <TeamCardForm teamId={me.team_id} />}
    </div>
  );
}

function ViewerProfile() {
  const me = useSession((s) => s.me)!;
  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Profile</h1>
      <Card className="flex items-center gap-4 p-5">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand-ink">
          <Eye size={26} />
        </span>
        <div>
          <div className="font-bold">{me.display_name} · viewer login</div>
          <p className="mt-1 text-sm text-muted">
            This is a shared, read-only account for watching the auction. You can see every player, team and live bid, but you
            can't bid or change anything. Only the admin can change this login's name or password.
          </p>
        </div>
      </Card>
    </div>
  );
}

function ProfileCard() {
  const me = useSession((s) => s.me)!;
  const setMe = useSession((s) => s.setMe);
  const [name, setName] = useState(me.display_name);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setMe(await api.patch<Me>("/me", { display_name: name }));
      toast.ok("Profile saved");
    } catch (err) {
      toast.error(err);
    }
  };
  const upload = async (f: File) => {
    try {
      setMe(await api.upload<Me>("/me/avatar", f));
      toast.ok("Photo updated");
    } catch (err) {
      toast.error(err);
    }
  };
  return (
    <Card className="p-5">
      <SectionTitle>You</SectionTitle>
      <form onSubmit={save} className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <label className="cursor-pointer" title="Change photo">
          <Avatar name={me.display_name} imageId={me.avatar_image_id} size={72} className="ring-2 ring-line-strong hover:ring-brand" />
          <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
        <div className="flex-1">
          <Field label="Display name"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={64} required /></Field>
        </div>
        <Button variant="primary">Save</Button>
      </form>
      <p className="mt-3 text-xs text-muted">Signed in as <b>{me.username}</b> · {me.role}</p>
    </Card>
  );
}

function PasswordCard() {
  const setMe = useSession((s) => s.setMe);
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) return toast.error("The new passwords don't match");
    try {
      setMe(await api.post<Me>("/me/password", { current_password: cur, new_password: next }));
      setCur("");
      setNext("");
      setConfirm("");
      toast.ok("Password changed");
    } catch (err) {
      toast.error(err);
    }
  };
  return (
    <Card className="p-5">
      <SectionTitle>Password</SectionTitle>
      <form onSubmit={save} className="grid gap-3 sm:grid-cols-3">
        <Field label="Current"><Input type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} required /></Field>
        <Field label="New (6+ chars)"><Input type="password" autoComplete="new-password" minLength={6} value={next} onChange={(e) => setNext(e.target.value)} required /></Field>
        <Field label="Repeat new"><Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required /></Field>
        <div className="sm:col-span-3">
          <Button variant="primary">Change password</Button>
        </div>
      </form>
    </Card>
  );
}

export function TeamCardForm({ teamId }: { teamId: number }) {
  const team = useAuction((s) => s.snap?.teams.find((t) => t.id === teamId));
  const [form, setForm] = useState({ name: "", short_code: "", color: "#3b82f6" });
  useEffect(() => {
    if (team) setForm({ name: team.name, short_code: team.short_code, color: team.color });
  }, [team?.id, team?.name, team?.short_code, team?.color]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!team) return null;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.patch(`/teams/${teamId}`, form);
      toast.ok("Team saved");
    } catch (err) {
      toast.error(err);
    }
  };
  const upload = async (f: File) => {
    try {
      await api.upload(`/teams/${teamId}/logo`, f);
      toast.ok("Logo updated");
    } catch (err) {
      toast.error(err);
    }
  };
  return (
    <Card className="p-5">
      <SectionTitle>Team</SectionTitle>
      <form onSubmit={save} className="space-y-4">
        <div className="flex items-center gap-4">
          <label className="cursor-pointer" title="Change logo">
            <TeamLogo team={{ ...team, ...form }} size={72} />
            <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </label>
          <p className="text-xs text-muted">Tap the logo to upload a new one (up to 1 MB).</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_120px_120px]">
          <Field label="Team name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={64} required /></Field>
          <Field label="Short code"><Input value={form.short_code} onChange={(e) => setForm({ ...form, short_code: e.target.value.toUpperCase() })} maxLength={6} required /></Field>
          <Field label="Colour">
            <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="h-10 w-full cursor-pointer rounded-xl border border-line-strong bg-surface p-1" />
          </Field>
        </div>
        <Button variant="primary">Save team</Button>
      </form>
    </Card>
  );
}
