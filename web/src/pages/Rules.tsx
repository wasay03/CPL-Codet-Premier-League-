import { useQueryClient } from "@tanstack/react-query";
import { Lock, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useSettings } from "../api/hooks";
import type { Settings, Tier } from "../api/types";
import { Button, Card, Field, Input, Modal, Page, SectionTitle, TierBadge } from "../components/ui";
import { toast } from "../lib/toast";
import { refreshSnapshot } from "../realtime/poll";
import { Loading } from "./Teams";

type Form = Omit<Settings, "locked"> & { tiers: Tier[] };

export function RulesPage() {
  const { data } = useSettings();
  const qc = useQueryClient();
  const [form, setForm] = useState<Form | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  useEffect(() => {
    if (data) setForm(structuredClone(data));
  }, [data]);
  if (!data || !form) return <Loading />;
  const locked = data.locked;

  const num = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: Number(e.target.value) });
  const tierNum = (i: number, k: keyof Tier) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const tiers = [...form.tiers];
    tiers[i] = { ...tiers[i], [k]: k === "name" ? e.target.value : Number(e.target.value) };
    setForm({ ...form, tiers });
  };

  const maxSquadFromTiers = form.tiers.reduce((s, t) => s + t.max_per_team, 0);
  const fullAtBase = form.tiers.reduce((s, t) => s + t.max_per_team * t.base_price, 0);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.put("/settings", form);
      toast.ok("Rules saved");
      qc.invalidateQueries({ queryKey: ["settings"] });
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <Page
      title="Auction rules"
      actions={locked && <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-700 px-3 py-1.5 text-sm text-slate-300"><Lock size={14} /> Locked — the auction has started</span>}
    >
      <form onSubmit={save} className="space-y-5">
        <fieldset disabled={locked} className="space-y-5">
          <Card className="p-5">
            <SectionTitle>Purse & squad</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Purse per team"><Input type="number" min={1} value={form.purse} onChange={num("purse")} /></Field>
              <Field label="Minimum squad"><Input type="number" min={0} value={form.min_squad} onChange={num("min_squad")} /></Field>
              <Field label="Maximum squad" hint={`Tier quotas add up to ${maxSquadFromTiers}`}><Input type="number" min={1} value={form.max_squad} onChange={num("max_squad")} /></Field>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              A full squad bought at base prices costs <b className="text-slate-300">{fullAtBase}</b>, leaving <b className="text-slate-300">{form.purse - fullAtBase}</b> for bidding wars.
            </p>
          </Card>

          <Card className="p-5">
            <SectionTitle>Tiers</SectionTitle>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                    <th className="pb-2 pr-2">Tier</th>
                    <th className="pb-2 pr-2">Name</th>
                    <th className="pb-2 pr-2">Max / team</th>
                    <th className="pb-2 pr-2">Base price</th>
                    <th className="pb-2">Bid step</th>
                  </tr>
                </thead>
                <tbody>
                  {form.tiers.map((t, i) => (
                    <tr key={t.id}>
                      <td className="py-1 pr-2"><TierBadge tier={t} /></td>
                      <td className="py-1 pr-2"><Input value={t.name} onChange={tierNum(i, "name")} /></td>
                      <td className="py-1 pr-2"><Input type="number" min={0} value={t.max_per_team} onChange={tierNum(i, "max_per_team")} /></td>
                      <td className="py-1 pr-2"><Input type="number" min={1} value={t.base_price} onChange={tierNum(i, "base_price")} /></td>
                      <td className="py-1"><Input type="number" min={1} value={t.bid_step} onChange={tierNum(i, "bid_step")} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="p-5">
            <SectionTitle>Timers</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Opening timer (seconds)" hint="Clock for the first bid"><Input type="number" min={1} value={form.opening_timer_s} onChange={num("opening_timer_s")} /></Field>
              <Field label="Reset timer (seconds)" hint="Clock after each new bid"><Input type="number" min={1} value={form.reset_timer_s} onChange={num("reset_timer_s")} /></Field>
            </div>
          </Card>

          <Card className="p-5">
            <SectionTitle>Price slabs</SectionTitle>
            <Toggle checked={form.slabs_enabled} onChange={(v) => setForm({ ...form, slabs_enabled: v })} label="Use price slabs instead of the per-tier bid step" />
            {form.slabs_enabled && (
              <div className="mt-4 space-y-2">
                {form.slabs.map((s, i) => (
                  <div key={i} className="flex items-end gap-2">
                    <Field label="From price"><Input type="number" min={0} value={s.from} onChange={(e) => setForm({ ...form, slabs: form.slabs.map((x, j) => (j === i ? { ...x, from: Number(e.target.value) } : x)) })} /></Field>
                    <Field label="Step"><Input type="number" min={1} value={s.step} onChange={(e) => setForm({ ...form, slabs: form.slabs.map((x, j) => (j === i ? { ...x, step: Number(e.target.value) } : x)) })} /></Field>
                    <Button type="button" variant="ghost" onClick={() => setForm({ ...form, slabs: form.slabs.filter((_, j) => j !== i) })}><Trash2 size={16} /></Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => setForm({ ...form, slabs: [...form.slabs, { from: 0, step: 5 }] })}>
                  <Plus size={14} /> Add slab
                </Button>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <SectionTitle>Accelerated round</SectionTitle>
            <Toggle checked={form.accelerated_enabled} onChange={(v) => setForm({ ...form, accelerated_enabled: v })} label="After Emerging, owners nominate unsold players to re-offer at the Emerging base price" />
          </Card>
        </fieldset>
        {!locked && <Button variant="primary" size="lg">Save rules</Button>}
      </form>

      <Card className="mt-8 border-rose-500/30 p-5">
        <SectionTitle>Danger zone</SectionTitle>
        <p className="mb-3 text-sm text-slate-400">Reset wipes every sale and bid, refills purses and unlocks the rules. Players, teams and users stay.</p>
        <Button variant="danger" onClick={() => setResetOpen(true)}>Reset auction…</Button>
      </Card>
      <ResetModal open={resetOpen} onClose={() => setResetOpen(false)} />
    </Page>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 text-sm text-slate-300">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? "bg-gavel" : "bg-ink-600"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
      </button>
      {label}
    </label>
  );
}

function ResetModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [text, setText] = useState("");
  const reset = async () => {
    try {
      await api.post("/auction/reset", { confirm: text });
      await refreshSnapshot();
      toast.ok("Auction reset");
      setText("");
      onClose();
    } catch (err) {
      toast.error(err);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Reset the auction">
      <p className="mb-3 text-sm text-slate-400">This can't be undone. Type <b className="text-white">RESET</b> to confirm.</p>
      <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="RESET" />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="danger" disabled={text !== "RESET"} onClick={reset}>Reset everything</Button>
      </div>
    </Modal>
  );
}
