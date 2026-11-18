import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";
import { useUsers } from "../api/hooks";
import type { Me } from "../api/types";
import { Avatar, Button, Card, Field, Input, Modal, Page, Select } from "../components/ui";
import { toast } from "../lib/toast";
import { useAuction } from "../realtime/auctionStore";
import { Loading } from "./Teams";

export function UsersPage() {
  const { data: users, isLoading } = useUsers();
  const teams = useAuction((s) => s.snap?.teams ?? []);
  const online = useAuction((s) => s.snap?.online ?? []);
  const [editing, setEditing] = useState<Me | null>(null);
  if (isLoading || !users) return <Loading />;

  return (
    <Page title="Users">
      <Card className="divide-y divide-ink-700/60">
        {users.map((u) => {
          const team = teams.find((t) => t.id === u.team_id);
          return (
            <div key={u.id} className="flex flex-wrap items-center gap-4 px-4 py-3">
              <div className="relative">
                <Avatar name={u.display_name} imageId={u.avatar_image_id} size={40} />
                <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-ink-850 ${online.includes(u.id) ? "bg-emerald-400" : "bg-slate-600"}`} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium">{u.display_name}</div>
                <div className="text-xs text-slate-500">
                  @{u.username} · {u.role}
                  {u.must_change_password && <span className="ml-2 text-amber-400">must change password</span>}
                </div>
              </div>
              {u.role === "owner" && (
                <span className="inline-flex items-center gap-2 text-sm">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: team?.color ?? "#475569" }} />
                  {team?.name ?? "No team"}
                </span>
              )}
              <Button variant="outline" size="sm" onClick={() => setEditing(u)}>Edit</Button>
            </div>
          );
        })}
      </Card>
      {editing && <EditUser user={editing} onClose={() => setEditing(null)} />}
    </Page>
  );
}

function EditUser({ user, onClose }: { user: Me; onClose: () => void }) {
  const qc = useQueryClient();
  const teams = useAuction((s) => s.snap?.teams ?? []);
  const [username, setUsername] = useState(user.username);
  const [display, setDisplay] = useState(user.display_name);
  const [team, setTeam] = useState(user.team_id ? String(user.team_id) : "");
  const [password, setPassword] = useState("");

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const body: Record<string, unknown> = { username, display_name: display };
    if (password) body.password = password;
    if (user.role === "owner") {
      if (team) body.team_id = Number(team);
      else body.clear_team = true;
    }
    try {
      await api.patch(`/users/${user.id}`, body);
      toast.ok("User saved");
      qc.invalidateQueries({ queryKey: ["users"] });
      onClose();
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Edit ${user.display_name}`}>
      <form onSubmit={save} className="space-y-3">
        <Field label="Username (login)"><Input value={username} onChange={(e) => setUsername(e.target.value)} required /></Field>
        <Field label="Display name"><Input value={display} onChange={(e) => setDisplay(e.target.value)} required /></Field>
        {user.role === "owner" && (
          <Field label="Team" hint="Picking a team that already has an owner swaps the two owners">
            <Select value={team} onChange={(e) => setTeam(e.target.value)}>
              <option value="">— none —</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Reset password" hint="Leave blank to keep it. They'll be asked to change it at next login.">
          <Input type="password" autoComplete="new-password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary">Save</Button>
        </div>
      </form>
    </Modal>
  );
}
