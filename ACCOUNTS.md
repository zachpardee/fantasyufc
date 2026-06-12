# Service Accounts — Fantasy Fighting League

Every external account this project depends on. No secrets here — keys live in
each platform's dashboard, in Railway/Vercel/EAS env vars, or in local
`.env` / `.env.production.local` files (gitignored).

| Service | What it does | Dashboard | Account / identifiers |
|---|---|---|---|
| **GitHub** | Code host; pushing `main` triggers web + API deploys | github.com/zachpardee/fantasyufc | zachpardee |
| **Vercel** | Hosts the web app. Public URL: **fantasyfightingleague.vercel.app** | vercel.com (zach-pardee-s-projects) | project `fantasy-ufc`, GitHub auto-deploy |
| **Railway** | Hosts the API + background jobs (event sync, scoring, scheduling) | railway.com | project "Fantasy Fighting League"; holds `ODDS_API_KEY`, `REDIS_URL`, Supabase prod keys |
| **Supabase (prod)** | Production database, auth, avatar storage | supabase.com/dashboard | project "Fantasy UFC" (`njrwgieloladyrajglpf`, us-west-2) |
| **Supabase (dev)** | Development database/auth/storage — local dev points here | supabase.com/dashboard | project "fantasy-ufc-dev" (`tkxuvgcsrrskoepaohjn`); free tier pauses after ~1 week idle — click Restore |
| **Upstash** | Production Redis cache (standings/fighters caching) | upstash.com | instance `nice-guinea-78049` |
| **The Odds API** | Betting odds for fights (underdog bonus, staking payouts) | the-odds-api.com | key stored in Railway env |
| **Expo / EAS** | Mobile builds + push notifications | expo.dev | account `blindtiger` (zachpardee@gmail.com), project `fantasy-ufc` |
| **Apple Developer** | iOS signing + (future) TestFlight/App Store | developer.apple.com / appstoreconnect.apple.com | William Pardee (Individual), team `RBZ34FV487`, ASC app id `6778824950`, bundle `com.zachpardee.fantasyfightingleague` |
| **ESPN (no account)** | Event/fight data source — public unofficial API, no key | — | — |

## Dev test accounts (dev Supabase only)
- `dev@fantasyufc.dev` / `devpassword1` (admin — `ADMIN_USER_IDS` in local `.env`)
- `dev2@fantasyufc.dev` / `devpassword1`

## Planned / not yet created
- **Sentry** — error alerting for API + web (next on the list)
