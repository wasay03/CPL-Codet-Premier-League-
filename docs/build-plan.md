# CPL Auction App — Build Plan

Nov 18, 2026 · @Muhammad Wasay

A real-time player auction for the Codet Premier League: one admin runs the room, three owners bid live from their own devices, and every rule is enforced by a FastAPI server, with a React frontend, both deployed on Railway.

## Roles and permissions

The app has four fixed accounts: one admin who runs the auction, and three owners who each control one team. The server checks every action against the caller's role, so hiding a button in the UI is never the only protection.

| Capability | Admin | Owner 1–3 |
| --- | --- | --- |
| Log in, edit own profile (display name, photo, password) | Yes | Yes |
| Edit own team profile (team name, short code, colour, logo) | Any team | Own team only |
| Add, edit, delete players; move a player between tiers | Yes | No |
| Edit auction rules (purse, quotas, base prices, increments, timers) | Yes, until the auction starts | View only |
| Start, pause, resume, end the auction | Yes | No |
| Choose the next player (in order, random or a specific pick) | Yes | No |
| Place a bid | No | Yes, for own team |
| Hammer early (sold / unsold) or extend the timer | Yes | No |
| Undo the last sale (correction) | Yes, with an audit entry | No |
| See live room, all squads, purses, bid history | Yes | Yes |
| Reset the auction, export results | Yes | No |

The three owner accounts are seeded as `owner1`, `owner2` and `owner3`, each bound to one team. The admin can rename teams, reassign which person logs in as which owner, and reset any owner's password.

## Auction rules

Every team starts with the same 1000-point purse and builds a squad of 7 to 9 players under per-tier quotas. These are the defaults seeded from the notes. The admin can change any of them before the auction starts, and they lock once it begins.

| Tier | Max per team | Base price | Bid step | Players in pool | Slots across 3 teams |
| --- | --- | --- | --- | --- | --- |
| Platinum | 2 | 200 | 20 | 6 | 6 |
| Diamond | 2 | 100 | 10 | 7 | 6 |
| Gold | 2 | 50 | 5 | 9 | 6 |
| Silver | 2 | 25 | 5 | 10 | 6 |
| Emerging | 1 | 10 | 2 | 9 | 3 |
| **Total** | **9** |  |  | **41** | **27** |

A full 9-player squad bought at base prices costs 760, which leaves 240 of headroom for bidding wars. With 41 players and 27 slots, at least 14 players will finish unsold.

### How bidding works

1. **Order.** Tiers run top-down: Platinum, Diamond, Gold, Silver, Emerging. Within a tier, the admin plays players in a shuffled order or picks one by hand.
2. **Opening bid.** The first bid on a player is the tier's base price. Each later bid adds the tier's bid step.
3. **Timer.** 30 seconds for the opening bid. Each new bid resets the clock to 15 seconds. The server owns the clock; clients only display it.
4. **No self-raise.** The team holding the current high bid cannot bid again until someone outbids it.
5. **Tier quota.** A team that already holds its maximum for the player's tier cannot bid.
6. **Squad cap.** A team with 9 players cannot bid.
7. **Purse reserve.** A team must always be able to reach the 7-player minimum. Its largest allowed bid is its purse minus a reserve: (players still needed after this one) × (cheapest base price among tiers where it still has a slot).
8. **Sold.** When the clock hits zero with a bid on the table, the player goes to the highest bidder and the price leaves that team's purse in the same database transaction.
9. **Unsold drops a tier.** With no bid, the player moves down one tier, takes that tier's base price, and joins the end of its queue. A Platinum player can fall all the way to Emerging.
10. **Accelerated round.** A player unsold in Emerging goes to the unsold pool. After Emerging, each owner nominates players from the pool, and those are re-offered at the Emerging base price. The admin can skip this round.
11. **Auction end.** The auction ends when every queue is empty or every team has 9 players.

### What comes from the IPL

- **Equal purse, set squad range.** IPL 2026 gave every franchise the same purse and a squad of 18 to 25 ([ESPNcricinfo](https://www.espncricinfo.com/ci/content/story/1515453.html)). CPL scales this to 1000 points and 7 to 9 players.
- **Increments that rise with price.** IPL bid steps grow as the price climbs: 5 lakh up to 1 crore, 10 lakh from 1 to 2 crore, 20 lakh from 2 to 3 crore ([Business Today](https://www.businesstoday.in/amp/sports/ipl/story/ipl-2025-mega-auction-dates-players-and-team-purses-everything-you-need-to-know-454814-2024-11-23)). CPL uses one flat step per tier by default, with optional price slabs the admin can switch on.
- **Accelerated rounds.** In IPL 2026, franchises named unsold players to bring back in accelerated rounds ([ESPNcricinfo](https://www.espncricinfo.com/ci/content/story/1515453.html)). Rule 10 copies this.
- **Left out.** Retentions and Right to Match need a previous season's squads, so they don't apply to a first edition. The silent tie-breaker isn't needed: the server orders bids by arrival, so two teams can never tie.

## Player pool

The seed file loads these 41 players. Names marked (?) were hard to read in the handwriting; the admin can fix them in the Players screen before the auction. Anas (Diamond) and Mubashir (Silver) were struck out in the notes, so they are left out.

| Tier | Count | Players |
| --- | --- | --- |
| Platinum | 6 | Rahim Khan, Baqal, Ahmed Raza, Sanaullah, Farzeen, Hazim |
| Diamond | 7 | Murtaza, Muaz, Yasir Jalal, Areeb, Rafey, Wasay, Zain |
| Gold | 9 | Sarim, Aashiq, Mubashir Rao, Zahid, Hashmani (?), Yasir Raza, Danial, Danish, Shahzaib |
| Silver | 10 | Ruh (?), Ayubi, Abd (?), Aham Ali (?), Hassan, Mudassir Rizwan, Ammar, Kaleem, Anwar, Kashif |
| Emerging | 9 | Nazeer, Shaheer, Hussam, Jahanzaib, Ali, Bilal, Sharjeel, Wajahat, Mudassir Naeem |

Each player record also has optional profile fields the admin can fill: playing role (batter, bowler, all-rounder, wicket-keeper), batting and bowling style, photo, and a short note shown on the auction screen.

## Architecture

One FastAPI service on Railway serves the built React app, the REST API and the WebSocket from a single domain, backed by Railway's Postgres plugin. Every state change passes through the auction engine, which writes to Postgres in a transaction and then broadcasts to all four browsers.

&#91;embedded content: system architecture · 1 service + Postgres on Railway\]

REST calls (logins, edits, admin controls) and socket bids both end in the same engine functions, so the rules are enforced in one place.

## Tech stack

Python 3.12 with FastAPI on the server, React 18 with TypeScript and Vite in the browser, and Postgres for storage. FastAPI's built-in WebSocket support carries the live auction, so no Socket.IO layer is needed.

| Layer | Choice | Why |
| --- | --- | --- |
| API framework | FastAPI + Uvicorn | Async, typed, native WebSockets, auto-generated OpenAPI docs |
| Validation | Pydantic v2 | Request and response schemas shared with the OpenAPI spec |
| Database | PostgreSQL 16 (Railway plugin) | Row locks for safe concurrent bids; same SQL you know from YugabyteDB |
| ORM and driver | SQLAlchemy 2.0 async + asyncpg | Typed models, async sessions |
| Migrations | Alembic | Schema history, seed migration for the 41 players |
| Auth | JWT (PyJWT) + passlib\[bcrypt\] | Stateless tokens for REST and the WebSocket handshake |
| Images | Stored in Postgres as bytea, max 1 MB, resized with Pillow | No extra storage service for 45 small photos |
| Tests | pytest, pytest-asyncio, httpx | Engine unit tests plus API and WebSocket integration tests |
| Frontend build | Vite + React 18 + TypeScript | Fast builds, static output FastAPI can serve |
| Routing | React Router 6 | Role-guarded routes |
| Server data | TanStack Query | Caching and refetch for players, teams, settings |
| Live state | Zustand store fed by one WebSocket hook | One source of truth for the auction room |
| UI | Tailwind CSS + shadcn/ui, Framer Motion | Clean components, a "SOLD" animation |
| Forms | react-hook-form + zod | Profile, player and rules forms with validation |

One optional addition: Redis for pub/sub. It is only needed if the API ever runs as more than one instance. One instance easily handles 4 users, so the plan leaves it out.

## Data model

Eleven Postgres tables. Every lot (one player going under the hammer once) is its own row, so a player who drops a tier gets a second lot and the full history survives. Two single-row tables, `settings` and `auction_state`, hold the rules and the live room state.

| Table | Key columns | Notes |
| --- | --- | --- |
| `users` | id, username (unique), password\_hash, role (`admin` / `owner`), display\_name, avatar\_image\_id, team\_id, updated\_at | 4 rows seeded; owners link to a team |
| `teams` | id, name, short\_code, color, logo\_image\_id, purse\_remaining | 3 rows seeded; purse\_remaining changes only inside the sale transaction |
| `tiers` | id, key, name, rank (1 = Platinum … 5 = Emerging), max\_per\_team, base\_price, bid\_step | 5 rows; rank decides the drop order |
| `players` | id, name, original\_tier\_id, current\_tier\_id, status (`queued` / `on_block` / `sold` / `unsold_pool`), queue\_pos, role, batting\_style, bowling\_style, photo\_image\_id, note, sold\_team\_id, sold\_price, drop\_count | 41 rows seeded |
| `settings` | purse, min\_squad, max\_squad, opening\_timer\_s, reset\_timer\_s, slabs\_enabled, slabs (jsonb), accelerated\_enabled, locked | One row; `locked` turns true at start |
| `auction_state` | status (`not_started` / `running` / `paused` / `accelerated` / `finished`), current\_tier\_id, current\_lot\_id, version | One row; `version` increments on every change |
| `lots` | id, player\_id, tier\_id, round (`main` / `accelerated`), status (`open` / `sold` / `unsold` / `cancelled`), opening\_price, high\_bid, high\_team\_id, ends\_at, closed\_at | `ends_at` lets the timer resume after a restart |
| `bids` | id, lot\_id, team\_id, user\_id, amount, created\_at | Append-only; unique (lot\_id, amount) blocks duplicate bids |
| `nominations` | team\_id, player\_id | Owner picks for the accelerated round |
| `images` | id, content\_type, data (bytea), created\_at | Avatars, team logos, player photos |
| `audit_log` | id, actor\_user\_id, action, payload (jsonb), created\_at | Every admin action, sale, undo and rule change |

Two derived values are computed in one query, never stored: a team's squad count per tier, and its purse reserve (rule 7). The engine and the UI both read them from `GET /api/teams`.

## REST API

REST handles everything that isn't time-critical: login, profiles, players, rules and admin controls. All routes sit under `/api`, take a `Bearer` token, and return 403 when the role doesn't match. FastAPI publishes the full spec at `/docs`.

| Method and path | Who | Purpose |
| --- | --- | --- |
| `POST /auth/login` | Anyone | Username + password → JWT (12 h) |
| `GET /me`, `PATCH /me` | Any user | Read or edit own display name |
| `POST /me/password` | Any user | Change own password (needs current password) |
| `POST /me/avatar` | Any user | Upload own photo (multipart, ≤ 1 MB) |
| `GET /images/{id}` | Any user | Serve an avatar, logo or player photo |
| `GET /teams` | Any user | All teams with squad, purse left, reserve, open slots per tier |
| `PATCH /teams/{id}`, `POST /teams/{id}/logo` | Owner (own) or admin | Team name, short code, colour, logo |
| `GET /players?tier=&status=` | Any user | Player list with filters |
| `POST /players`, `PATCH /players/{id}`, `DELETE /players/{id}` | Admin | Add, edit (incl. tier), remove a player |
| `POST /players/{id}/photo` | Admin | Upload player photo |
| `POST /players/import` | Admin | Bulk add from CSV (name, tier) |
| `PUT /players/order` | Admin | Set queue order within a tier |
| `GET /settings`, `PUT /settings` | All read, admin writes | Purse, squad range, tiers, timers, slabs; 409 once locked |
| `GET /users`, `PATCH /users/{id}` | Admin | Rename, reset password, link owner to team |
| `GET /auction/state` | Any user | Full room snapshot (same shape as the WebSocket `state` event) |
| `POST /auction/start` · `pause` · `resume` · `end` | Admin | Room lifecycle |
| `POST /auction/next` | Admin | Put the next player on the block: `{mode: "order" \| "random" \| "pick", player_id?}` |
| `POST /auction/hammer` · `extend` | Admin | Close the lot now, or add seconds |
| `POST /auction/undo-sale` | Admin | Reverse the last sale, refund the purse, re-queue the player |
| `POST /auction/nominations` | Owner | Pick unsold players for the accelerated round |
| `POST /auction/accelerated/start` | Admin | Start the accelerated round from nominations |
| `POST /auction/reset` | Admin | Wipe sales and bids, unlock settings (asks to type RESET) |
| `GET /auction/history`, `GET /export/results.csv` | Any user / admin | Lot-by-lot log; final squads as CSV |

Bids go over the WebSocket for speed. `POST /auction/bid` exists as a fallback and runs the same engine function.

## Real-time protocol

One WebSocket per browser at `/ws?token=<jwt>`. The server rejects a bad token before accepting the socket. Every message is JSON `{type, version, data}`; `version` is `auction_state.version`, so a client that sees a gap knows it missed something and refetches `GET /auction/state`.

The clock is never streamed tick by tick. The server sends `ends_at` plus its own `server_now`; each client computes its offset once and counts down locally. All clients then show the same second, and the server alone decides when time is up.

**Client to server**

| Type | Data | Who |
| --- | --- | --- |
| `bid` | `{lot_id, amount}` | Owner. `amount` must equal the next valid bid shown on screen, so two clicks on a stale price can't both land |
| `ping` | `{}` | Anyone, every 20 s, keeps the socket alive through Railway's proxy |

**Server to clients**

| Type | Sent to | Data |
| --- | --- | --- |
| `state` | One client, on connect | Full snapshot: status, current lot, teams, tiers, queues, recent bids |
| `lot_opened` | All | lot\_id, player profile, tier, opening price, ends\_at, server\_now |
| `bid_placed` | All | lot\_id, team\_id, amount, next valid bid, new ends\_at |
| `bid_rejected` | Bidder only | Reason code: `LOT_CLOSED`, `PAUSED`, `STALE_AMOUNT`, `OWN_HIGH_BID`, `TIER_FULL`, `SQUAD_FULL`, `OVER_MAX_BID` |
| `lot_closed` | All | Result `sold` (team, price) or `unsold` (tier it dropped to, or `unsold_pool`) |
| `teams_updated` | All | Purse, reserve, max bid and squad for each team |
| `auction_status` | All | `running`, `paused` (with the seconds left), `accelerated`, `finished` |
| `settings_updated` | All | New rules or player edits, so lists refresh |
| `presence` | All | Which of the 4 users are online, shown as dots on the team cards |
| `pong` | Sender | `{server_now}` for clock sync |

## Auction engine

All auction logic lives in one module on the server. It is the only code that changes purses, squads or player status, and it runs each bid inside a single database transaction. Clients only send intentions ("bid 220") and render what the server broadcasts.

&#91;embedded content: lot lifecycle · 8 states, 1 decision\]

A lot ends only two ways: sold to the highest bidder, or unsold. Unsold players re-enter one tier lower until Emerging, then wait in the pool for the accelerated round.

### Bid validation

`place_bid(user, lot_id, amount)` runs these checks in order. The first failure returns its reason code to the bidder only.

```python
async with session.begin():
    state = await lock("auction_state")          # SELECT ... FOR UPDATE
    lot   = await lock_lot(lot_id)
    team  = await lock_team(user.team_id)

    if state.status != "running":              reject("PAUSED")
    if lot.status != "open" or now() >= lot.ends_at: reject("LOT_CLOSED")
    if lot.high_team_id == team.id:            reject("OWN_HIGH_BID")
    if amount != next_bid(lot):                reject("STALE_AMOUNT")
    if squad_size(team) >= settings.max_squad: reject("SQUAD_FULL")
    if tier_count(team, lot.tier) >= lot.tier.max_per_team: reject("TIER_FULL")
    if amount > max_bid(team):                 reject("OVER_MAX_BID")

    insert_bid(lot, team, amount)
    lot.high_bid, lot.high_team_id = amount, team.id
    lot.ends_at = now() + settings.reset_timer_s
    state.version += 1
broadcast("bid_placed", ...)
```

- **Next bid.** The tier's base price if there is no bid yet, otherwise `high_bid + step`. With slabs on, the step comes from the slab the current price falls in.
- **Max bid.** `purse_remaining − reserve`, where reserve = `max(0, min_squad − (squad_size + 1)) × cheapest open base price`, and the cheapest open base is the lowest base price among tiers where the team still has a slot.
- **Why no double sales.** The row locks serialise every bid on the lot. The exact-amount check means two owners clicking "Bid 220" at once produce one accepted bid and one `STALE_AMOUNT`, whose screen already shows 230.

### Timer and closing

- **One task per lot.** When a lot opens, an asyncio task sleeps until `ends_at`. If a bid moves `ends_at`, it sleeps again. At the deadline it calls `close_lot`, which re-locks the lot, re-checks the time, and either sells or marks unsold.
- **Sale.** In one transaction: the player becomes `sold`, `sold_team_id` and `sold_price` are set, the team's `purse_remaining` drops, and a `lot_closed` event goes out. Then `teams_updated` follows.
- **Unsold.** The player's `current_tier_id` moves to the next rank, `drop_count` goes up, and the player joins the end of that tier's queue. From Emerging the player goes to `unsold_pool` instead.
- **Pause.** Pausing stores the seconds left on the lot. Resuming sets a fresh `ends_at` from that value.
- **Restart recovery.** On startup the app reads any `open` lot. If `ends_at` has passed it closes the lot at once; otherwise it restarts the timer for the time left.
- **Undo.** Undoing the last sale refunds the price, removes the player from the squad, puts the player back at the front of the queue, and writes an audit entry.

## React frontend

One single-page app serves all four roles. The Auction Room is the main screen: everyone sees the same live view, owners get a bid panel and the admin gets a control bar. Routes are guarded by role from the JWT, and the server re-checks every action.

| Route | Who | Screen |
| --- | --- | --- |
| `/login` | Anyone | Username and password; redirects to the room |
| `/room` | All | Live auction room (layout below) |
| `/teams`, `/teams/:id` | All | Squads by tier, purse spent and left, open slots |
| `/players` | All (admin edits) | Searchable player list by tier and status. Admin: add, edit, change tier, upload photo, drag to reorder, CSV import |
| `/history` | All | Every lot: player, tier, result, price, bid count, drops |
| `/profile` | All | Own display name, photo, password. Owners also edit their team's name, short code, colour and logo |
| `/admin/rules` | Admin | Purse, squad range, the tier table (quota, base, step), timers, slabs, accelerated round. Read-only with a lock badge once the auction starts |
| `/admin/users` | Admin | Rename users, reset passwords, link each owner to a team |
| `/results` | All | Final squads side by side; admin can download the CSV |

### Auction Room layout

- **On the block (centre).** Player photo, name, tier badge, role, base price. Under it the current high bid in large type, tinted in the leading team's colour, and a countdown ring that turns red under 5 seconds.
- **Team cards (right).** One per team: logo, purse left, max allowed bid, slots left per tier, squad count, and an online dot. The leading team's card is highlighted.
- **Bid panel (owners, bottom).** One large button, "Bid 220", always showing the next valid amount. When bidding isn't allowed it is disabled with the reason in plain words ("You hold the high bid", "Platinum slots full", "Over your max bid of 180").
- **Control bar (admin, top).** Start, Pause/Resume, Next player (in order / random / pick), Hammer now, +10 s, Undo last sale, End.
- **Side panels.** Upcoming queue grouped by tier, the unsold pool, and a live feed of bids and results.
- **Results.** A full-screen "SOLD to \<team> for 240" or "UNSOLD — drops to Diamond" overlay for 3 seconds, with an optional gavel sound.

### State management

- **`useAuctionSocket` hook.** Opens the socket after login, reconnects with backoff (1, 2, 4, up to 10 s), and sends `ping` every 20 s.
- **Zustand `auctionStore`.** The hook writes every server event into it, and components read slices from it. The UI never changes auction state on its own: the bid button shows a spinner until `bid_placed` or `bid_rejected` comes back, usually within 100 ms.
- **TanStack Query.** Handles everything outside the room (players, settings, profile). A `settings_updated` event invalidates those queries.
- **Clock.** `server_now` from `lot_opened` and `pong` gives a clock offset. A `useCountdown(ends_at)` hook renders at 10 fps.

## Security, deployment and repo layout

### Security

- **Passwords.** Hashed with bcrypt. Seed passwords come from environment variables, and each account must change its password on first login (`must_change_password` flag).
- **Tokens.** JWT (HS256, `JWT_SECRET`), valid 12 hours, kept in memory and sessionStorage, never in a URL except the one-time WebSocket handshake. A bad token closes the socket with code 4401.
- **Authorisation.** A role and team-ownership check on every route and every socket message. An owner can only bid for, and edit, the team linked to their account.
- **Abuse limits.** At most 5 bid messages per second per user. Uploads are capped at 1 MB, type-checked, and re-encoded with Pillow.
- **Audit.** Every admin action, sale, undo and rule change goes to `audit_log`, shown on `/history` to the admin.

### Deployment on Railway

Ship one Railway service plus the Railway Postgres plugin. A multi-stage Dockerfile builds the React app, then copies the static files into the Python image. FastAPI serves `/api`, `/ws` and the SPA from the same domain, so no CORS setup and no separate WebSocket URL are needed.

1. Push the repo to GitHub and create a Railway project from it.
2. Add the PostgreSQL plugin and reference its `DATABASE_URL` in the service. The app rewrites the scheme to `postgresql+asyncpg://`.
3. Set the environment variables below.
4. Start command: `alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT`. The migration also seeds tiers, teams, users and the 41 players.
5. Health check path: `/api/health`. Generate a Railway domain; HTTPS and WSS come with it.
6. Keep replicas at 1. Lot timers run inside the process; scaling out would need Redis and a leader lock.

| Variable | Example | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | from the Postgres plugin | Database connection |
| `JWT_SECRET` | 64 random characters | Signs login tokens |
| `ADMIN_PASSWORD`, `OWNER1_PASSWORD`, `OWNER2_PASSWORD`, `OWNER3_PASSWORD` | set per person | First-login passwords |
| `TZ` | `Asia/Karachi` | Timestamps in history and the CSV export |

The app can't run inside a Claude artifact. Artifact pages block all `fetch` and WebSocket calls to other hosts, so the React app lives on the Railway domain. An artifact can still serve as a CPL landing page that links to it.

### Repo layout

```text
cpl-auction/
├── Dockerfile                 # stage 1: build web/, stage 2: python + dist
├── railway.json               # start command, health check, 1 replica
├── backend/
│   ├── alembic/               # migrations + seed (tiers, teams, users, players)
│   ├── app/
│   │   ├── main.py            # FastAPI app, routers, static SPA mount
│   │   ├── config.py          # pydantic-settings from env
│   │   ├── db.py              # async engine + session
│   │   ├── models.py          # SQLAlchemy models
│   │   ├── schemas.py         # Pydantic request/response models
│   │   ├── auth.py            # hashing, JWT, role dependencies
│   │   ├── routers/           # auth, me, teams, players, settings, users, auction, images
│   │   ├── engine/
│   │   │   ├── rules.py       # pure functions: next_bid, max_bid, reserve, can_bid
│   │   │   ├── auction.py     # open_lot, place_bid, close_lot, drop_tier, undo
│   │   │   └── timer.py       # asyncio lot timer, restart recovery
│   │   └── ws/
│   │       ├── manager.py     # connection registry, broadcast, presence
│   │       └── endpoint.py    # /ws handshake + message loop
│   ├── tests/                 # rules unit tests, API + WebSocket tests
│   └── pyproject.toml
└── web/
    ├── src/
    │   ├── api/               # fetch client, TanStack Query hooks
    │   ├── realtime/          # useAuctionSocket, auctionStore, useCountdown
    │   ├── pages/             # Login, Room, Teams, Players, History, Profile, Rules, Users, Results
    │   ├── components/        # PlayerCard, TeamCard, BidButton, ControlBar, Countdown, SoldOverlay
    │   └── routes.tsx         # role-guarded routes
    └── package.json
```

## Build plan

About 8 to 9 working days for one developer, deploying to Railway from day one so every phase is tested on the real host.

1. **Foundation (1 day).** Repo, Dockerfile, FastAPI skeleton, models, Alembic seed for tiers, teams, users and players, login and JWT. Deploy to Railway with Postgres and confirm `/api/health`.
2. **Admin and profiles (1–2 days).** Players CRUD with tier changes, photo upload and CSV import; rules editor; users screen; own profile and team profile. React pages: Login, Players, Rules, Users, Profile.
3. **Auction engine (2 days).** `rules.py` pure functions with unit tests first, then `place_bid` under a row lock, the lot timer with restart recovery, close lot, tier drop and undo.
4. **Live room (2 days).** WebSocket manager, events, presence; React Room with store, countdown, bid button reasons, admin control bar, sold and unsold overlays.
5. **Finish (1 day).** Accelerated round with nominations, History, Results, CSV export.
6. **Dry run (1 day).** Bot load test, then a mock auction with the four real users on their own phones and laptops; fix what they hit.

### Testing

- **Rules unit tests.** Table-driven cases for next bid, purse reserve, max bid, tier quota, squad cap and slabs.
- **Race test.** Three bots send the same bid amount at the same instant. Exactly one is accepted; the other two get `STALE_AMOUNT`.
- **Timer tests.** A lot closes at its deadline. Killing the process mid-lot and restarting either resumes the remaining time or closes the lot if the deadline passed.
- **Drop cascade.** A player unsold in every tier ends in the unsold pool with `drop_count` 4.
- **Full simulated auction.** Bots bid at random through all tiers. At the end, every team has 7 to 9 players, no purse is negative, and no quota is broken.
- **Browser smoke test.** Playwright logs in as each role and runs one bid-and-sell cycle.

### Open questions

- [ ] The second column in the notes (20, 10, 5, 5, 2): is it the bid step? This plan assumes yes.
- [ ] Is 7 the squad minimum and 9 (the sum of the tier quotas) the maximum?
- [ ] When a player drops a tier, does he take the lower tier's base price (assumed) or keep his own?
- [ ] If a team can't reach 7 because players ran out, should the admin allot unsold players at base price?
- [ ] Confirm Hashmani, Ruh, Abd and Aham Ali, and the owners' names and team names.
- [ ] Is the currency "points" or a real amount in PKR?
