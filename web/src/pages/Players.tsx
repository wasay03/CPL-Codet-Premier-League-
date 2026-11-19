import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { api } from "../api/client";
import { usePlayers, useSettings } from "../api/hooks";
import type { Player, Tier } from "../api/types";
import { Avatar, Button, Card, Empty, Field, Input, Modal, Page, Select, textareaClass, TierBadge } from "../components/ui";
import { useSession } from "../lib/session";
import { toast } from "../lib/toast";
import { useAuction } from "../realtime/auctionStore";
import { Loading } from "./Teams";
import { pkr } from "../lib/money";

const STATUS: Record<string, string> = { queued: "Queued", on_block: "On the block", sold: "Sold", unsold_pool: "Unsold pool" };
const ROLES = ["batter", "bowler", "all-rounder", "wicket-keeper"];

// Stable fallback: a fresh `[]` inside a zustand selector re-renders forever.
const NONE: never[] = [];

export function PlayersPage() {
  const { data: players, isLoading } = usePlayers();
  const { data: settings } = useSettings();
  const teams = useAuction((s) => s.snap?.teams) ?? NONE;
  const isAdmin = useSession((s) => s.me?.role === "admin");
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [tier, setTier] = useState("");
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<Player | "new" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const tiers = settings?.tiers ?? [];

  const filtered = useMemo(
    () =>
      (players ?? []).filter(
        (p) =>
          (!q || p.name.toLowerCase().includes(q.toLowerCase())) &&
          (!tier || p.tier_id === Number(tier)) &&
          (!status || p.status === status),
      ),
    [players, q, tier, status],
  );

  if (isLoading || !settings) return <Loading />;

  const move = async (p: Player, dir: -1 | 1) => {
    const list = (players ?? []).filter((x) => x.tier_id === p.tier_id && x.status === "queued").sort((a, b) => a.queue_pos - b.queue_pos);
    const i = list.findIndex((x) => x.id === p.id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    try {
      await api.put("/players/order", { tier_id: p.tier_id, player_ids: list.map((x) => x.id) });
      qc.invalidateQueries({ queryKey: ["players"] });
    } catch (e) {
      toast.error(e);
    }
  };

  const remove = async (p: Player) => {
    if (!window.confirm(`Delete ${p.name}?`)) return;
    try {
      await api.del(`/players/${p.id}`);
      toast.ok(`${p.name} deleted`);
      qc.invalidateQueries({ queryKey: ["players"] });
    } catch (e) {
      toast.error(e);
    }
  };

  const importCsv = async (file: File) => {
    try {
      const res = await api.upload<{ added: number; errors: string[] }>("/players/import", file);
      toast.ok(`Imported ${res.added} player(s)`);
      if (res.errors.length) toast.error(res.errors.slice(0, 3).join(" · "));
      qc.invalidateQueries({ queryKey: ["players"] });
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <Page
      title="Players"
      subtitle={`${players?.length ?? 0} players in the pool`}
      actions={
        isAdmin && (
          <div className="flex gap-2">
            <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])} />
            <Button variant="outline" onClick={() => fileRef.current?.click()} title="CSV columns: name, tier, role, batting_style, bowling_style, note">
              <Upload size={16} /> Import CSV
            </Button>
            <Button variant="primary" onClick={() => setEditing("new")}>
              <Plus size={16} /> Add player
            </Button>
          </div>
        )
      }
    >
      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_180px_180px]">
        <Input placeholder="Search players…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={tier} onChange={(e) => setTier(e.target.value)}>
          <option value="">All tiers</option>
          {tiers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Any status</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </div>
      {filtered.length === 0 ? (
        <Empty>No players match.</Empty>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line bg-well/60 text-left text-[11px] font-semibold uppercase tracking-[.1em] text-muted">
                <th className="px-4 py-3">Player</th>
                <th className="px-4 py-3">Tier</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Team · price</th>
                {isAdmin && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const t = tiers.find((x) => x.id === p.tier_id);
                const orig = tiers.find((x) => x.id === p.original_tier_id);
                const team = teams.find((x) => x.id === p.sold_team_id);
                return (
                  <tr key={p.id} className="border-b border-line last:border-0 hover:bg-well/60">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <Avatar name={p.name} imageId={p.photo_image_id} size={34} />
                        <div>
                          <div className="font-semibold">{p.name}</div>
                          <div className="text-xs capitalize text-muted">{[p.role, p.batting_style, p.bowling_style].filter(Boolean).join(" · ") || "—"}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <TierBadge tier={t} />
                      {orig && orig.id !== t?.id && <div className="mt-1 text-[11px] text-muted">was {orig.name}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-fg-2">{STATUS[p.status]}</td>
                    <td className="px-4 py-2.5">
                      {team ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full" style={{ background: team.color }} />
                          {team.name} · <b className="text-brand-ink">{pkr(p.sold_price)}</b>
                        </span>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-1">
                          {p.status === "queued" && (
                            <>
                              <IconBtn title="Move up" onClick={() => move(p, -1)}><ArrowUp size={15} /></IconBtn>
                              <IconBtn title="Move down" onClick={() => move(p, 1)}><ArrowDown size={15} /></IconBtn>
                            </>
                          )}
                          <IconBtn title="Edit" onClick={() => setEditing(p)}><Pencil size={15} /></IconBtn>
                          <IconBtn title="Delete" onClick={() => remove(p)} danger><Trash2 size={15} /></IconBtn>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
      {editing && <PlayerForm player={editing === "new" ? null : editing} tiers={tiers} onClose={() => setEditing(null)} />}
    </Page>
  );
}

function IconBtn({ children, danger, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean }) {
  return (
    <button {...props} className={`rounded-lg p-1.5 text-muted transition-colors ${danger ? "hover:bg-danger/10 hover:text-danger" : "hover:bg-brand-soft hover:text-brand-ink"}`}>
      {children}
    </button>
  );
}

function PlayerForm({ player, tiers, onClose }: { player: Player | null; tiers: Tier[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: player?.name ?? "",
    tier_id: player?.tier_id ?? tiers[0]?.id,
    role: player?.role ?? "",
    batting_style: player?.batting_style ?? "",
    bowling_style: player?.bowling_style ?? "",
    note: player?.note ?? "",
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: k === "tier_id" ? Number(e.target.value) : e.target.value });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const body = {
      ...form,
      role: form.role || null,
      batting_style: form.batting_style || null,
      bowling_style: form.bowling_style || null,
      note: form.note || null,
    };
    try {
      const saved = player ? await api.patch<Player>(`/players/${player.id}`, body) : await api.post<Player>("/players", body);
      if (photo) await api.upload(`/players/${saved.id}/photo`, photo);
      toast.ok(player ? "Player updated" : "Player added");
      qc.invalidateQueries({ queryKey: ["players"] });
      onClose();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  const locked = player?.status === "sold" || player?.status === "on_block";
  return (
    <Modal open onClose={onClose} title={player ? `Edit ${player.name}` : "Add player"}>
      <form onSubmit={save} className="space-y-3">
        <Field label="Name"><Input value={form.name} onChange={set("name")} required maxLength={64} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tier" hint={locked ? "Locked while on the block or sold" : undefined}>
            <Select value={form.tier_id} onChange={set("tier_id")} disabled={locked}>
              {tiers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
          <Field label="Role">
            <Select value={form.role} onChange={set("role")}>
              <option value="">—</option>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
          </Field>
          <Field label="Batting style"><Input value={form.batting_style} onChange={set("batting_style")} placeholder="Right-hand bat" /></Field>
          <Field label="Bowling style"><Input value={form.bowling_style} onChange={set("bowling_style")} placeholder="Left-arm spin" /></Field>
        </div>
        <Field label="Note (shown on the auction screen)">
          <textarea
            value={form.note}
            onChange={set("note")}
            maxLength={500}
            rows={2}
            className={textareaClass}
          />
        </Field>
        <Field label="Photo" hint="PNG, JPEG or WebP, up to 1 MB">
          <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} className="text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-brand-soft file:px-3 file:py-1.5 file:font-semibold file:text-brand-ink" />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </div>
      </form>
    </Modal>
  );
}
