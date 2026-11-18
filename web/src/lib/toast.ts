import { create } from "zustand";

export interface Toast {
  id: number;
  text: string;
  tone: "ok" | "error" | "info";
}

let n = 0;
export const useToasts = create<{ toasts: Toast[]; push: (t: Omit<Toast, "id">) => void; drop: (id: number) => void }>(
  (set, get) => ({
    toasts: [],
    push: (t) => {
      const id = ++n;
      set({ toasts: [...get().toasts, { ...t, id }].slice(-4) });
      window.setTimeout(() => get().drop(id), 3500);
    },
    drop: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  }),
);

export const toast = {
  ok: (text: string) => useToasts.getState().push({ text, tone: "ok" }),
  error: (e: unknown) => useToasts.getState().push({ text: e instanceof Error ? e.message : String(e), tone: "error" }),
  info: (text: string) => useToasts.getState().push({ text, tone: "info" }),
};
