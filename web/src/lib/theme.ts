import { create } from "zustand";

export type Theme = "light" | "dark";

const KEY = "cpl-theme";

function read(): Theme {
  try {
    return localStorage.getItem(KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function apply(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0c081c" : "#ffffff");
}

export const useTheme = create<{ theme: Theme; toggle: () => void }>((set, get) => ({
  theme: read(),
  toggle: () => {
    const next: Theme = get().theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* private mode: theme just won't persist */
    }
    apply(next);
    set({ theme: next });
  },
}));
