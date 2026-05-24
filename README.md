# Fantasy UFC

ESPN-style fantasy sports app for UFC fighters. Pick fighters, score points based on real fight results, and compete head-to-head against your league.

## Stack

- **API** — Node.js / Express / TypeScript (`apps/api`)
- **Web** — React / Vite / TypeScript (`apps/web`)
- **Mobile** — Expo / React Native (`apps/mobile`)
- **Database** — Supabase (PostgreSQL)
- **Cache** — Redis
- **Shared types** — `packages/shared`

---

## Prerequisites

- Node.js 18+
- npm 9+
- A [Supabase](https://supabase.com) project (free tier works)
- Redis — local (`redis://localhost:6379`) or [Upstash](https://upstash.com) free tier

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

You'll need:
- `SUPABASE_URL` and `SUPABASE_ANON_KEY` — from Supabase Dashboard → Project Settings → API
- `SUPABASE_SERVICE_ROLE_KEY` — same page, service role key (keep secret)
- `DATABASE_URL` — Supabase Dashboard → Project Settings → Database → Connection String (Session mode, port 5432)
- `REDIS_URL` — `redis://localhost:6379` for local Redis, or your Upstash URL
- `JWT_SECRET` — Supabase Dashboard → Project Settings → API → JWT Settings → JWT Secret
- `PORT` — defaults to `3000`

### 3. Run the database migration

```bash
npm run db:migrate
```

### 4. (Optional) Seed fighter and event data

```bash
npm run db:seed
```

---

## Running locally

Open two terminals:

**Terminal 1 — API server**
```bash
export $(grep -v '^#' .env | xargs)
node_modules/.bin/tsx apps/api/src/index.ts
```

**Terminal 2 — Web app**
```bash
node_modules/.bin/vite apps/web
```

Then open [http://localhost:5173](http://localhost:5173).

> **Note:** The API must be running before the web app will load data.

---

## Apps

| App | Command | URL |
|-----|---------|-----|
| Web | `node_modules/.bin/vite apps/web` | http://localhost:5173 |
| API | `tsx apps/api/src/index.ts` | http://localhost:3000 |
| Mobile | `cd apps/mobile && npx expo start` | Expo Go app |

---

## Project structure

```
fantasy-ufc/
├── apps/
│   ├── api/        # Express REST API
│   ├── web/        # React/Vite web app
│   ├── mobile/     # Expo mobile app
│   └── desktop/    # Electron desktop app
├── packages/
│   └── shared/     # Shared TypeScript types and utilities
└── .env.example    # Environment variable template
```
