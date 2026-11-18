import { create } from "zustand";
import type { Me } from "../api/types";

const KEY = "cpl.session";

interface SessionState {
  token: string | null;
  me: Me | null;
  login: (token: string, me: Me) => void;
  setMe: (me: Me) => void;
  setMustChange: (v: boolean) => void;
  logout: () => void;
}

function load(): { token: string | null; me: Me | null } {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* storage unavailable */
  }
  return { token: null, me: null };
}

function save(token: string | null, me: Me | null) {
  try {
    if (token) sessionStorage.setItem(KEY, JSON.stringify({ token, me }));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}

export const useSession = create<SessionState>((set, get) => ({
  ...load(),
  login: (token, me) => {
    save(token, me);
    set({ token, me });
  },
  setMe: (me) => {
    save(get().token, me);
    set({ me });
  },
  setMustChange: (v) => {
    const me = get().me;
    if (me) get().setMe({ ...me, must_change_password: v });
  },
  logout: () => {
    save(null, null);
    set({ token: null, me: null });
  },
}));
