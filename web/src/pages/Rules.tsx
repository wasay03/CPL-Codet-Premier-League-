import { useQueryClient } from "@tanstack/react-query";
import { Lock, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useSettings } from "../api/hooks";
import type { Settings, Tier } from "../api/types";
import { Button, Card, Field, Input, Modal, Page, SectionTitle, TierBadge } from "../components/ui";
import { fromMillions, pkr, toMillions } from "../lib/money";
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
  const tierNum = (i: number, k: keyof Tier) => (e: React.ChangeEvent<HTMLInputElement>) => setTier(i, k, k === "name" ? e.target.value : Number(e.target.value));
  const setTier = (i: number, k: keyof Tier, v: string | number) => {
    const tiers = [...form.tiers];
    tiers[i] = { ...tiers[i], [k]: v };
    setForm({ ...form, tiers });
  };
  const setSlab = (i: number, k: "from" | "step", v: number) =>
    setForm({ ...form, slabs: form.slabs.map((x, j) => (j === i ? { ...x, [k]: v } : x)) });

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
      actions={locked && <span className="inline-flex items-center gap-1.5 rounded-full bg-well px-3 py-1.5 text-sm text-fg-2"><Lock size={14} /> Locked — the auction has started</span>}
    >
      <form onSubmit={save} className="space-y-5">
        <fieldset disabled={locked} className="space-y-5">
          <Card className="p-5">
            <SectionTitle>Purse & squad</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Purse per team (Rs millions)"><MoneyInput units={form.purse} min={0.1} onUnits={(v) => setForm({ ...form, purse: v })} /></Field>
              <Field label="Minimum squad"><Input type="number" min={0} value={form.min_squad} onChange={num("min_squad")} /></Field>
              <Field label="Maximum squad" hint={`Tier quotas add up to ${maxSquadFromTiers}`}><Input type="number" min={1} value={form.max_squad} onChange={num("max_squad")} /></Field>
            </div>
            <p className="mt-3 text-xs text-muted">
              A full squad bought at base prices costs <b className="text-fg-2">{pkr(fullAtBase)}</b>, leaving <b className="text-fg-2">{pkr(form.purse - fullAtBase)}</b> for bidding wars.
            </p>
          </Card>

          <Card className="p-5">
            <SectionTitle>Tiers</SectionTitle>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-[.1em] text-muted">
                    <th className="pb-2 pr-2">Tier</th>
                    <th className="pb-2 pr-2">Name</th>
                    <th className="pb-2 pr-2">Max / team</th>
                    <th className="pb-2 pr-2">Base price · millions</th>
                    <th className="pb-2">{form.slabs_enabled ? "Bid step · off (bands on)" : "Bid step · millions"}</th>
                  </tr>
                </thead>
                <tbody>
                  {form.tiers.map((t, i) => (
                    <tr key={t.id}>
                      <td className="py-1 pr-2"><TierBadge tier={t} /></td>
                      <td className="py-1 pr-2"><Input value={t.name} onChange={tierNum(i, "name")} /></td>
                      <td className="py-1 pr-2"><Input type="number" min={0} value={t.max_per_team} onChange={tierNum(i, "max_per_team")} /></td>
                      <td className="py-1 pr-2"><MoneyInput units={t.base_price} min={0.1} onUnits={(v) => setTier(i, "base_price", v)} /></td>
                      <td className="py-1"><MoneyInput units={t.bid_step} min={0.1} onUnits={(v) => setTier(i, "bid_step", v)} disabled={form.slabs_enabled} /></td>
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
            <SectionTitle>Bid steps</SectionTitle>
            <Toggle checked={form.slabs_enabled} onChange={(v) => setForm({ ...form, slabs_enabled: v })} label="IPL-style price bands: the step grows as the price climbs (instead of a fixed step per tier)" />
            {form.slabs_enabled && (
              <div className="mt-4 space-y-2">
                {form.slabs.map((s, i) => (
                  <div key={i} className="flex items-end gap-2">
                    <Field label="From price (Rs M)"><MoneyInput units={s.from} min={0} onUnits={(v) => setSlab(i, "from", v)} /></Field>
                    <Field label="Each bid adds (Rs M)"><MoneyInput units={s.step} min={0.1} onUnits={(v) => setSlab(i, "step", v)} /></Field>
                    <Button type="button" variant="ghost" onClick={() => setForm({ ...form, slabs: form.slabs.filter((_, j) => j !== i) })}><Trash2 size={16} /></Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => setForm({ ...form, slabs: [...form.slabs, { from: 0, step: 5 }] })}>
                  <Plus size={14} /> Add band
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

      <Card className="mt-8 border-danger/30 p-5">
        <SectionTitle>Danger zone</SectionTitle>
        <p className="mb-3 text-sm text-muted">Reset wipes every sale and bid, refills purses and unlocks the rules. Players, teams and users stay.</p>
        <Button variant="danger" onClick={() => setResetOpen(true)}>Reset auction…</Button>
      </Card>
      <ResetModal open={resetOpen} onClose={() => setResetOpen(false)} />
    </Page>
  );
}

/** A money field typed in Rs millions (2.5) and stored in API units of Rs 100,000 (25). */
function MoneyInput({ units, onUnits, min, disabled }: { units: number; onUnits: (units: number) => void; min?: number; disabled?: boolean }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted">Rs</span>
      <Input
        type="number"
        min={min}
        step={0.1}
        disabled={disabled}
        value={toMillions(units)}
        onChange={(e) => onUnits(fromMillions(Number(e.target.value)))}
        className="pl-9"
      />
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 text-sm text-fg-2">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? "bg-brand" : "bg-line-strong"}`}
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
      <p className="mb-3 text-sm text-muted">This can't be undone. Type <b className="text-fg">RESET</b> to confirm.</p>
      <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="RESET" />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="danger" disabled={text !== "RESET"} onClick={reset}>Reset everything</Button>
      </div>
    </Modal>
  );
}
