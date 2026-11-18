import { useQuery } from "@tanstack/react-query";
import { api } from "./client";
import type { AuditEntry, ClosedLot, Me, Player, Settings, Tier } from "./types";

export const usePlayers = () => useQuery({ queryKey: ["players"], queryFn: () => api.get<Player[]>("/players") });
export const useSettings = () =>
  useQuery({ queryKey: ["settings"], queryFn: () => api.get<Settings & { tiers: Tier[] }>("/settings") });
export const useUsers = (enabled = true) => useQuery({ queryKey: ["users"], queryFn: () => api.get<Me[]>("/users"), enabled });
export const useHistory = () => useQuery({ queryKey: ["history"], queryFn: () => api.get<ClosedLot[]>("/auction/history") });
export const useAudit = (enabled: boolean) =>
  useQuery({ queryKey: ["audit"], queryFn: () => api.get<AuditEntry[]>("/audit"), enabled });
