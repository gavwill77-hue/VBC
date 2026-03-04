# Golf Weekend Live Scoring (Callaway)

Production-focused web app for a 16-player golf weekend competition using the Callaway Scoring System on a par-72 course.

## Stack

- Next.js (App Router) + TypeScript
- Prisma + SQLite
- Tailwind CSS
- Custom secure credentials auth (hashed password/PIN + signed session cookie)
- Polling for live leaderboard updates

## Included pages

- `/login`
- `/admin`
- `/scorecard`
- `/leaderboard`
- `/player/[id]` (public read-only scorecard)

## Features implemented

- Full 18-hole stroke play entry
- Weekend mode: 2 rounds per weekend with aggregate winner across both rounds
- Historical weekends preserved and re-activatable from admin
- Callaway par-72 table in structured code (`src/lib/callaway.ts`)
- Admin toggle: max double par per-hole cap
- Admin toggle: `cap deduction per hole at double par`
- Entire course eligible for deduction (holes 1-18; no exclusions)
- Start on hole 1 or 10 (entry order adapts, storage remains by hole number)
- Round-level start hole setting (applies to the whole weekend round)
- Live net/gross leaderboard with tie-break rules
- Per-hole progress and score distribution
- Secure login with rate limiting
- Audit log for admin actions
- CSV export for leaderboard and player scorecards
- Offline-tolerant autosave (local cache + sync)
- Australian English copy/style

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Create environment file:

```bash
cp .env.example .env
```

3. Set `AUTH_SECRET` in `.env` to a long random value.

4. Generate Prisma client and migrate:

```bash
npm run prisma:generate
npm run prisma:migrate -- --name init
```

5. Seed demo admin + 16 players:

```bash
npm run db:seed
```

6. Run app:

```bash
npm run dev
```

## Default seeded credentials

- Admin: `admin` / `ChangeMe!2026`
- Players: `player01`..`player16`
- PINs: `100001`..`100016`

Update all credentials in `/admin` before real use.

## Testing

```bash
npm test
```

Unit tests cover:

- Max double par enabled vs disabled
- Deduction cap toggle enabled vs disabled
- Half-hole entitlement behaviour
- Tie-break/shared placing behaviour
- All-hole eligibility (including 17/18)

## Deployment notes

- Deploy to any Node-compatible platform (Vercel, Render, Fly, etc.)
- SQLite suits simple single-instance deployment
- For multi-instance/production scaling, move Prisma datasource to Postgres
- Set `AUTH_SECRET` and `DATABASE_URL` in deployment env

## Prisma models

See `prisma/schema.prisma` for:

- `User`, `Event`, `Player`, `Round`, `HoleScore`, `AuditLog`

Round records include stored calculation inputs and Callaway table version for reproducibility.
