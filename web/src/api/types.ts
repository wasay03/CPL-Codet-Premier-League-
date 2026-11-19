export type Role = "admin" | "owner" | "viewer";
export type AuctionStatus = "not_started" | "running" | "paused" | "accelerated" | "finished";
export type PlayerStatus = "queued" | "on_block" | "sold" | "unsold_pool";

export interface Me {
  id: number;
  username: string;
  role: Role;
  display_name: string;
  avatar_image_id: number | null;
  team_id: number | null;
  must_change_password: boolean;
}

export interface Tier {
  id: number;
  key: string;
  name: string;
  rank: number;
  max_per_team: number;
  base_price: number;
  bid_step: number;
}

export interface Player {
  id: number;
  name: string;
  tier_id: number;
  original_tier_id: number;
  status: PlayerStatus;
  queue_pos: number;
  role: string | null;
  batting_style: string | null;
  bowling_style: string | null;
  photo_image_id: number | null;
  note: string | null;
  sold_team_id: number | null;
  sold_price: number | null;
  drop_count: number;
}

export interface Team {
  id: number;
  name: string;
  short_code: string;
  color: string;
  logo_image_id: number | null;
  purse_remaining: number;
  purse_spent: number;
  squad_size: number;
  tier_counts: Record<string, number>;
  open_slots: Record<string, number>;
  reserve: number;
  max_bid: number;
  squad: Player[];
  owner: { id: number; display_name: string; avatar_image_id: number | null; online: boolean } | null;
}

export interface Slab {
  from: number;
  step: number;
}

export interface Settings {
  purse: number;
  min_squad: number;
  max_squad: number;
  opening_timer_s: number;
  reset_timer_s: number;
  slabs_enabled: boolean;
  slabs: Slab[];
  accelerated_enabled: boolean;
  locked: boolean;
}

export interface BidRow {
  id: number;
  team_id: number;
  user_id: number;
  amount: number;
  at: number;
}

export interface LotState {
  id: number;
  player: Player;
  tier_id: number;
  round: "main" | "accelerated";
  status: string;
  opening_price: number;
  high_bid: number | null;
  high_team_id: number | null;
  next_bid: number;
  ends_at: number | null;
  paused_remaining_ms: number | null;
  bid_count: number;
  bids: BidRow[];
}

export interface ClosedLot {
  id: number;
  player_id: number;
  player_name: string | null;
  tier_id: number;
  round: string;
  status: "sold" | "unsold" | "cancelled";
  opening_price: number;
  price: number | null;
  team_id: number | null;
  dropped_to_tier_id: number | null;
  to_pool: boolean;
  bid_count: number;
  drop_count: number;
  opened_at: number | null;
  closed_at: number | null;
}

export interface UserBrief {
  id: number;
  username: string;
  display_name: string;
  role: Role;
  team_id: number | null;
  avatar_image_id: number | null;
  online: boolean;
}

export interface Snapshot {
  server_now: number;
  version: number;
  status: AuctionStatus;
  resume_status: AuctionStatus | null;
  current_tier_id: number | null;
  settings: Settings;
  tiers: Tier[];
  teams: Team[];
  lot: LotState | null;
  queues: Record<string, Player[]>;
  queued_count: number;
  unsold_pool: Player[];
  nominations: Record<string, number[]>;
  recent: ClosedLot[];
  users: UserBrief[];
  online: number[];
}

export interface AuditEntry {
  id: number;
  action: string;
  payload: Record<string, unknown>;
  actor: string;
  created_at: number;
}
