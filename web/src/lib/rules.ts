import type { Snapshot, Team } from "../api/types";

/** Plain-words reason an owner can't bid right now, or null when the bid button should be live. */
export function bidBlockReason(snap: Snapshot, team: Team | undefined, msLeft: number): string | null {
  const lot = snap.lot;
  if (!team) return "Your account isn't linked to a team";
  if (snap.status === "paused") return "Auction paused";
  if (snap.status === "not_started") return "The auction hasn't started";
  if (snap.status === "finished") return "The auction is over";
  if (!lot) return "Waiting for the next player";
  if (msLeft <= 0) return "Time's up";
  if (lot.high_team_id === team.id) return "You hold the high bid";
  if (team.squad_size >= snap.settings.max_squad) return `Squad full (${team.squad_size}/${snap.settings.max_squad})`;
  const tier = snap.tiers.find((t) => t.id === lot.tier_id);
  if (tier && (team.tier_counts[String(tier.id)] ?? 0) >= tier.max_per_team) return `${tier.name} slots full`;
  if (lot.next_bid > team.max_bid) return `Over your max bid of ${team.max_bid}`;
  return null;
}

export const REJECTION_TEXT: Record<string, string> = {
  LOT_CLOSED: "Too late — the lot closed",
  PAUSED: "The auction is paused",
  STALE_AMOUNT: "Someone bid first — try the new amount",
  OWN_HIGH_BID: "You already hold the high bid",
  TIER_FULL: "Your slots in this tier are full",
  SQUAD_FULL: "Your squad is full",
  OVER_MAX_BID: "That's over your max bid",
  RATE_LIMITED: "Slow down — too many bids",
  NOT_OWNER: "Only team owners can bid",
  BAD_REQUEST: "Bad bid request",
};
