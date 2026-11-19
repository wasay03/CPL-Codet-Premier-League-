# CPL Auction

A real-time player auction for the Codet Premier League. One admin runs the room, and three team owners bid live from their own phones or laptops. A FastAPI server enforces every rule and serves the React app, the REST API and the WebSocket from one domain. It is built to deploy on Railway with Postgres.

The full design is in [docs/build-plan.md](docs/build-plan.md).

## Features

- **Live auction room.** The countdown ring is driven by the server clock. The leading team is flagged in its own colour, there's a "SOLD / UNSOLD" overlay, a bid ladder, and a live feed. Online dots show who is connected.
- **Light and dark themes.** Purple-and-white light mode by default, with a dark mode toggle in the header (remembered per browser).
- **Money in PKR.** Every team gets a Rs 200M purse. Amounts show in millions (Rs 22M) and are stored as whole units of Rs 100,000.
- **Server-side rules.** Base price per tier, IPL-style bid steps that grow with the price (or a flat step per tier), the no-self-raise rule, tier quotas, the squad cap, and a purse reserve so every team can still reach the minimum squad. Bids are serialised with row locks, so if two owners click the same amount at once, one bid is accepted and the other gets `STALE_AMOUNT`.
- **Tier drops.** An unsold player drops one tier and takes that tier's base price. A player unsold in Emerging goes to the unsold pool.
- **Accelerated round.** Owners nominate players from the unsold pool, and the admin re-offers them at the Emerging base price.
- **Admin controls.** Start, pause/resume, next player (in order, random or a specific pick), hammer, +10 s, undo last sale, end, and reset (you type RESET to confirm). Every admin action is written to an audit log.
- **Admin screens.** Players (CRUD, tier moves, photos, CSV import, queue order), Rules (locked once the auction starts), and Users (rename, reset password, link owners to teams).
- **Profiles.** Every user can set a display name, photo and password. Owners can also edit their team's name, short code, colour and logo.
- **History, Results and CSV export.**
- **Restart recovery.** An open lot's timer resumes after a restart. If its deadline passed while the server was down, the lot closes at once.

## Stack

| Layer | Choice |
| --- | --- |
| API | Python 3.12, FastAPI, Uvicorn, native WebSockets |
| Data | PostgreSQL, SQLAlchemy 2 async + asyncpg, Alembic (schema + seed migrations) |
| Auth | JWT (PyJWT, HS256, 12 h), bcrypt |
| Images | Stored in Postgres (bytea), resized to 512 px and re-encoded with Pillow, max 1 MB |
| Web | React 18, TypeScript, Vite, React Router 6, TanStack Query, Zustand, Tailwind CSS, Framer Motion |
| Tests | pytest + pytest-asyncio + httpx (48 tests), Playwright browser smoke test |

## Repository layout

```text
├── Dockerfile            # stage 1 builds web/, stage 2 runs the API and serves web/dist
├── railway.json          # Dockerfile build, /api/health check, 1 replica
├── backend/
│   ├── alembic/          # 0001 schema, 0002 seed (tiers, teams, users, settings, 41 players)
│   ├── app/
│   │   ├── engine/       # rules.py (pure), auction.py (engine), timer.py, snapshot.py
│   │   ├── routers/      # auth, me, images, teams, players, settings, users, auction
│   │   └── ws/           # connection manager + /ws endpoint
│   └── tests/
└── web/
    ├── src/{api,realtime,components,pages,lib}
    └── e2e/smoke.spec.ts
```

## Local development

You need Python 3.12+, Node 20+ and Docker (for Postgres).

```bash
# 1. Postgres
docker run -d --name cpl-pg -e POSTGRES_USER=cpl -e POSTGRES_PASSWORD=cpl -e POSTGRES_DB=cpl \
  -p 127.0.0.1:55450:5432 postgres:16
docker exec cpl-pg psql -U cpl -c "create database cpl_test"

# 2. API (http://127.0.0.1:8000, docs at /docs)
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]"
cp ../.env.example .env        # edit as needed
alembic upgrade head           # creates tables and seeds the 41 players
uvicorn app.main:app --reload

# 3. Web (http://localhost:5173, proxies /api and /ws to :8000)
cd ../web
npm install
npm run dev
```

Seeded logins are `admin`, `owner1`, `owner2` and `owner3`. Their passwords come from `ADMIN_PASSWORD` and `OWNER1..3_PASSWORD`, and default to `cpl-admin`, `cpl-owner1` and so on. Every account must change its password on first login, unless `REQUIRE_PASSWORD_CHANGE=false`.

There is also a shared, read-only `viewer` login for spectators. It sees the live room, players, teams, history and results, but can't bid, nominate or change anything (including its own name or password). Its password comes from `VIEWER_PASSWORD` (default `cpl-viewer`), it is never forced to change it, and the admin can reset it on the Users page.

## Tests

```bash
cd backend && pytest                      # uses DATABASE_URL=…/cpl_test by default
cd web && npx playwright test             # against a running server with a fresh DB
```

The backend suite covers:

- table-driven rules tests (next bid, slabs, reserve, max bid, quotas)
- API role checks
- the three-way race
- tier quota, purse reserve and pause
- the drop cascade to the pool (`drop_count` 4)
- timer close, restart recovery and undo
- the accelerated round and CSV export
- reset
- a full random-bot auction that checks invariants
- live WebSocket round trips, including `4401` on a bad token

## Deploying on Railway

1. Create a Railway project from this GitHub repo. It builds with the `Dockerfile`.
2. Add the **PostgreSQL** plugin and reference its `DATABASE_URL` in the service. The app rewrites the scheme for asyncpg.
3. Set the variables below.
4. The container runs `alembic upgrade head` and then starts Uvicorn on `$PORT`. The health check is `/api/health`.
5. Generate a Railway domain. HTTPS and WSS come with it.
6. **Keep replicas at 1.** Lot timers and the bid lock live in the process.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | From the Postgres plugin |
| `JWT_SECRET` | 64 random characters (signs login tokens) |
| `ADMIN_PASSWORD`, `OWNER1_PASSWORD`, `OWNER2_PASSWORD`, `OWNER3_PASSWORD` | First-login passwords, used when the seed migration runs |
| `TIMEZONE` | `Asia/Karachi`, used for the CSV export timestamp |

## Deploying on Vercel + Supabase

Vercel can't hold WebSockets or run background timers, so the app falls back automatically:

- **Polling.** When the socket can't connect, each browser fetches `/api/auction/state` about once a second. The room, feed and SOLD / UNSOLD overlays work the same way, about a second behind.
- **Lots close on the next request.** Every auction request first closes the current lot if its clock has run out. While anyone has the room open, polling makes that happen within about a second.

Setup:

1. **Database.** In Supabase, copy the **Session pooler** URI from **Connect** (not Direct, not Transaction pooler). Run `alembic upgrade head` once from your machine with that `DATABASE_URL` and the four `*_PASSWORD` variables set. Then enable row-level security on the `public` tables so Supabase's REST API can't read them. The app connects as the table owner, so RLS doesn't affect it.
2. **Backend project** (root `backend/`). Set `DATABASE_URL`, `DB_NULLPOOL=true`, `JWT_SECRET` and `TIMEZONE`. `TZ` is reserved on Vercel.
3. **Frontend project** (root `web/`). [web/vercel.json](web/vercel.json) forwards `/api/*` to the backend's domain. Change it if your backend URL differs.

## Notes and small departures from the plan

- **A bid never shortens the clock.** A bid sets the deadline to *at least* `reset_timer_s` from now. An early bid on a 30-second opening clock doesn't cut it to 15.
- **Open questions.** The app uses the assumptions the plan lists for its open questions: the second column in the notes is the bid step, squads are 7–9 players, and a dropped player takes the lower tier's base price. All of these can be changed on the Rules screen before the auction starts, except the drop-price rule.
- **Public image URLs.** `GET /api/images/{id}` needs no token, because `<img>` tags can't send one. Uploads are always re-encoded.
- **Library swaps.** Password hashing uses `bcrypt` directly instead of passlib, which is unmaintained. The UI uses small hand-written Tailwind components instead of shadcn/ui and react-hook-form/zod. Queue order is changed with up/down buttons, not drag-and-drop.
- **Reset ordering.** Reset puts every player back in their original tier, in the order they were added.
