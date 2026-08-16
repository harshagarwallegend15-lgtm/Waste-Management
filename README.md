# WasteWise — Community Waste-Management Accountability System

A community waste-management accountability and incentive system that rewards residents and
collectors for **verified** contributions, detects irresponsible dumping, educates repeat
offenders, ranks communities, and gives municipalities structured, location-based data.

> Make disposal easy → Verify it → Reward it → Educate → Involve the community → Improve

## Features (MVP)

| # | Feature | Status |
|---|---|---|
| 1 | **Verified doorstep collection** — resident uploads waste photo + GPS + timestamp; collector visits their area, uploads an after-photo; hybrid CV/AI matching verifies it | ✅ |
| 2 | **Irresponsible-dumping reports** — photo + GPS + timestamp, admin verification with duplicate detection, hotspot clustering | ✅ |
| 3 | **Behaviour-based education** — repeated mixed-waste collections trigger a targeted segregation lesson; improvement is recognized | ✅ (stub) |
| 4 | **Community score & challenges** — normalized per-resident 0–100 society score (participation, disposal, segregation, reports, improvement); admins launch challenges (collections / reports / participation / score); each society races on its own real verified activity, first-to-target pays a bonus to every resident | ✅ |
| 5 | **Collector accountability** — verified collections tracked, unverified complaints never hurt scores | ✅ |
| 6 | **Municipal dashboard** — live KPIs, hotspots, 14-day trends, full per-user trace, live leaderboards | ✅ |

## Architecture

```
server/index.cjs          Express entry (static frontend + /api)
server/lib/supabase.cjs   Supabase clients + storage
server/lib/cv.cjs         local heuristic computer-vision matching
server/lib/ai.cjs         Groq vision fallback for low-confidence matches
server/lib/verify.cjs     combines CV + GPS + time → verified / flagged / rejected
server/lib/points.cjs     immutable points ledger + award rules
server/lib/scoring.cjs    normalized society scores
server/lib/challenges.cjs challenge progress + completion + bonus payouts
server/routes/*.cjs       auth, requests, reports, problems, points, leaderboard, challenges, admin, education
public/                   role selector → role auth → role dashboards
supabase/schema.sql       tables + realtime publication + row-level security
scripts/seed.cjs          areas, societies, admin, demo users, sample data
tests/                    cv + challenges unit tests, e2e + supplement integration scripts
```

## Role entry flow

```
index.html (role selector)
  ├── Resident   → auth/resident.html   → resident.html
  ├── Collector  → auth/collector.html  → collector.html   (area auto-assigned by system)
  └── Admin      → auth/admin.html      → admin.html       (seeded accounts only)
```

## Setup

1. **Create a free Supabase project** at https://supabase.com.
2. In the Supabase SQL editor, run **`supabase/schema.sql`** — creates all tables,
   publishes them for Realtime, and enables row-level security (see Security below).
3. **Storage**: the server auto-creates the public **`waste-photos`** bucket on boot.
   If you prefer to create it manually: Storage → New bucket → name `waste-photos` →
   check **Public bucket**, file size limit 8 MB.
4. Copy `.env.example` to `.env` and fill in:
   ```env
   SUPABASE_URL=https://<project>.supabase.co
   SUPABASE_ANON_KEY=<anon key>                    # public — safe for browsers
   SUPABASE_SERVICE_ROLE_KEY=<service role key>    # secret — server only
   GROQ_API_KEY=<groq key for AI vision>           # optional; falls back to heuristic CV
   ```
5. Install and seed:
   ```bash
   npm install
   npm run seed        # areas, societies, admin + demo users, sample data
   npm run dev
   ```
6. Open **http://localhost:8080** and pick a role.

> **Secrets:** `SUPABASE_SERVICE_ROLE_KEY` and `GROQ_API_KEY` live only in `.env` (gitignored).
> The service role key must never be exposed to the browser — the server is the only
> component that holds it, and all writes go through `/api`.

### Demo accounts

| Role | Email | Password |
|---|---|---|
| Municipality Admin | `admin@wastewise.app` | `Admin@123` |
| Resident | `resident@wastewise.app` | `Resident@123` |
| Collector | `collector@wastewise.app` | `Collector@123` |

## Verification pipeline (hybrid CV)

1. Resident uploads a **before-photo** (GPS + timestamp server-recorded).
2. Collector marks **arrived** (GPS check), uploads an **after-photo**.
3. Local heuristic pass (`sharp`, `server/lib/cv.cjs`): both photos are **auto-contrast
   normalized and EXIF-rotation-corrected**, then described by:
   - **pHash** (2D-DCT low-frequency bits) + **dHash** (row-gradient bits) + aHash — lighting-robust
   - **HSV histogram** with an achromatic bucket — distinguishes colored waste from gray/white
   - **Foreground color histogram** (background estimated from the image border) — focuses on the waste
   - **6×6 spatial color histogram** — catches bag-swap / rearranged layouts
   - **Edge density + texture** descriptors — expose empty-doorstep photos
   These are combined with tuned weights → similarity score 0–1.
4. Thresholds (env-configurable: `CV_VERIFIED`, `CV_AI_MIN`):
   - `≥ 0.82` → **auto-verified** (local)
   - `0.55–0.82` → **AI vision** (Groq) compares both photos, returns verdict + confidence
   - `< 0.55` → **flagged** for admin review
   - An after-photo with almost no foreground/edge content ("empty doorstep") is flagged
     before the band check.
5. Combined with GPS proximity (≤ 300 m) and a time window (≤ 72 h) (`CV_GPS_MAX_M`, `CV_TIME_MAX_H`).
6. Every decision is logged to `verification_events` with reasons + per-signal breakdown;
   **points are awarded only on verified** (resident +20, collector +10, verified report +15).
   Admin overrides are also audited and only award points if not already awarded.

## Garbage-photo gate (capture-time)

Before any photo is accepted — **resident before-photo**, **collector after-photo**, and
**dumping-report photo** — the server runs a "does this look like garbage?" check
(`server/lib/garbage.cjs` → `classifyGarbage` in `cv.cjs`):

- **Reject instantly** if the photo is empty/blank/plain (a wall, floor, document, empty
  doorstep) — local heuristic on edge density, texture, foreground share and color diversity.
- **Accept** if it is clearly a heterogeneous waste scene.
- **Ambiguous middle band** → confirm with Groq vision when `GROQ_API_KEY` is set; if AI is
  unconfigured or unreachable it accepts on the local score (fail-open so a vision outage
  never blocks legitimate collections).
- Thresholds: `GARBAGE_PHOTO_CHECK` (default on), `GARBAGE_LOCAL_MIN` (0.62),
  `GARBAGE_AI_MIN` (0.30). Set `GARBAGE_PHOTO_CHECK=false` to disable.

A rejected photo returns HTTP 400 with a message the UI shows as a toast
(e.g. *"That before-photo does not look like garbage — Photo appears empty — no waste visible."*).

## Points

| Action | Points |
|---|---|
| Resident — verified collection | +20 |
| Collector — verified collection | +10 |
| Resident — verified dumping report | +15 |
| Challenge bonus (all residents of a completing society) | +25 (configurable) |
| Education lesson (future) | +5 |

All changes go through `points_transactions` (immutable), feeding live leaderboards
(resident / collector / society) via Supabase Realtime.

## Society problems

Residents post problems and comment on them. The admin sees every thread **ranked by the
posting society's overall score** (highest-scoring societies first) with comment history,
and can set status: open / in-progress / resolved.

## Admin traceability

Every resident and collector has a full drill-down: profile, GPS, address, points ledger,
all collection requests with before/after photos + match scores, dumping reports, and
society problems. Hotspot clustering + 14-day trends + live leaderboards are on the overview.

## Societies (location-based, realtime)

- **Signup**: the resident's browser traces their location (or they tap "Use my location")
  and the society dropdown shows **only the societies in their city** — those within
  `SOCIETY_CITY_RADIUS_KM` (default 5 km) of the traced location — nearest first, each
  showing its distance (e.g. `Green Valley Residency — 400 m`). If location isn't available
  the dropdown shows an "allow location" prompt and a manual capture button instead of
  listing every society. If no society is registered in the traced city, the dropdown
  shows the nearest **area/region name** (e.g. `📍 Zone C (East)`) instead and the resident
  can sign up under that area, picking a society later once one is registered nearby.
- **Dashboard "🌆 My society"**: residents see their own society card plus every society
  within the city radius of their traced location, ranked by distance, each with **live**
  aggregates — member count, open problems, pending pickups, verified collections today and
  the current society score (0–100) — refreshed over Supabase Realtime. Out-of-city
  (dummy) societies are never shown.
- **Joining / switching**: any society in the list can be joined with one click
  (`PATCH /api/societies/me`); the profile's society + area are updated and both the old
  and new society scores are recomputed so rankings stay accurate.
- Society geolocation comes from `societies.gps_lat/gps_lng` (seeded + backfilled by
  `npm run seed`). Before that migration is applied, the endpoints degrade gracefully —
  the list and live aggregates still work, distance ranking stays disabled.

## Community challenges

Admins launch challenges (collections / reports / participation / score) with a target, a
date window, and a per-resident bonus. Progress is computed **per society** from real
verified data only (`verified_at` within the challenge window). The moment a society
reaches its target the completion is recorded once and every resident of that society
receives the bonus via the immutable points ledger. Progress is checked automatically
after every verified collection, verified report, and admin override, and refreshes live
on both dashboards.

## Tests

```bash
npm test              # unit: CV sanity + garbage-photo gate + challenges
npm run test:cv       # CV matching only
npm run test:garbage  # garbage-photo gate (accepts waste, rejects blank/empty/plain photos)
npm run test:challenges  # challenge completion + bonus-payout logic
npm run test:e2e      # full flow against a live Supabase project (needs .env)
npm run test:supplement  # registration + admin override + no-double-points (needs .env)
```

The integration tests (`test:e2e`, `test:supplement`) hit the live database configured in
`.env`, so run them against your own Supabase project, not the demo one.

## Deployment

WasteWise is a single Node/Express process that serves the static frontend and the `/api`.
You can host it on Render, Railway, Fly.io, a VPS, or any Node 18+ platform.

### Render / Railway (recommended)

1. Push this repo to GitHub.
2. Create a new **Web Service** from the repo.
   - Build command: `npm install`
   - Start command: `npm start`
3. Add the environment variables from `.env.example` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`, `PORT` is set automatically by the platform).
4. Deploy. The server listens on `process.env.PORT`, runs the Supabase config check on boot,
   and exposes `GET /health` for uptime monitoring.

### Before going live

- Re-run **`supabase/schema.sql`** on the production project (idempotent) so row-level
  security is enabled.
- Run `npm run seed` once against the production database, then create real societies
  (or add an admin UI for it).
- Set `NODE_ENV=production` — the server then sends the HSTS header, disables static
  asset revalidation, and hides internal error details.
- HTTPS is terminated by the platform; never expose the service-role key to the client.

## Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `SUPABASE_URL` | ✅ | — | Supabase project URL |
| `SUPABASE_ANON_KEY` | ✅ | — | Public browser key (config + Realtime) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ prod | anon fallback | Server-only key for all DB writes |
| `GROQ_API_KEY` | optional | — | AI vision for low-confidence photo matches + garbage-photo gate |
| `GROQ_VISION_MODEL` | optional | `llama-3.2-90b-vision-preview` | Vision model id |
| `AI_TIMEOUT_MS` | optional | `25000` | AI request timeout |
| `GARBAGE_PHOTO_CHECK` | optional | `true` | Enable the capture-time garbage-photo gate |
| `GARBAGE_LOCAL_MIN` | optional | `0.62` | Local score ≥ this → accept without AI |
| `GARBAGE_AI_MIN` | optional | `0.30` | Below this → reject locally; in between → AI confirm |
| `CV_VERIFIED` | optional | `0.82` | Score ≥ this → auto-verified locally |
| `CV_AI_MIN` | optional | `0.55` | Scores in `[this, CV_VERIFIED)` → send to AI |
| `CV_GPS_MAX_M` | optional | `300` | Max before/after GPS distance (m) |
| `CV_TIME_MAX_H` | optional | `72` | Max before/after time gap (h) |
| `SOCIETY_CITY_RADIUS_KM` | optional | `5` | "Societies in your city" radius (km) |
| `PORT` | optional | `8080` | HTTP listen port |
| `NODE_ENV` | optional | — | `production` enables hardening |

## Security

- **All data access goes through the Node server** using the service-role key; the anon key
  shipped to browsers can only read and can never write (enforced by row-level security).
- **Row-level security is enabled** on every table (`schema.sql`). Because the server runs
  on the service role, RLS never changes server behaviour — it only blocks direct anon
  writes.
- **Uploads** are capped at 8 MB (`multer`) and served from the public `waste-photos`
  bucket (photos are of waste bags, not people).
- **Headers**: `nosniff`, frame-ancestors same-origin, referrer policy, and HSTS in
  production are set by the server. A strict CSP is intentionally deferred until the
  frontend is refactored off inline event handlers.
- **Secrets**: `.env` is gitignored; `.env.example` contains placeholders only. Never
  commit a real service-role or Groq key.

## Caveats (read before production)

- **Desktop-first web app**: browser geolocation on desktop is IP/WiFi-based (less accurate
  than phone GPS). The data model already supports a native/PWA mobile client later.
- **Local CV is heuristic, not forensic**: a trained model can be dropped into
  `server/lib/cv.cjs` (same 0–1 interface) to replace the heuristic pass. The descriptors
  and thresholds are tuned via `tests/cv.test.cjs` and env vars.
- **No admin "create society" UI yet**: societies are seeded/added via SQL or a script;
  an admin management page is a natural next step.
- Realtime publications require the `supabase_realtime` publication (standard).
