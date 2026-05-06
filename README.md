# Dota Coach MVP

Standalone Next.js MVP for deterministic Dota 2 coaching with **Lifestealer carry** only.

## Implemented flows
- Pre-Game Assistant (`/pre-game`)
- Post-Match Coach (`/post-match`)
- Developer Debug Page (`/debug`)

## Tech stack
- Next.js (App Router)
- TypeScript
- Route handlers in `src/app/api`
- Rules-driven engines in `src/lib/dota`

## Environment variables
Create `.env.local` using `.env.example`:

```bash
OPENDOTA_API_KEY=
STRATZ_API_TOKEN=
NEXT_PUBLIC_APP_NAME=Dota Coach MVP
```

### OpenDota key notes
- OpenDota works without API key on free tier limits.
- `OPENDOTA_API_KEY` can stay empty for local development.
- If you have a key, set it in `.env.local`:

```bash
OPENDOTA_API_KEY=your_key_here
```

## Run locally
```bash
npm install
npm run dev
```
Open `http://localhost:3000`.

## API endpoints
- `POST /api/pre-game/analyze`
- `POST /api/post-match/analyze`
- `POST /api/draft/normalize`
- `GET /api/heroes`
- `GET /api/debug/env`
- `GET /api/debug/match/:id`

Debug URLs:
- `/api/debug/env`
- `/api/debug/match/8781054570`

## Notes
- No database/auth/realtime overlay in v1.
- STRATZ token is used only server-side in `src/lib/dota/clients/stratz.ts`.
- If provider fields change, adapters isolate the uncertainty and preserve stable response shapes.

## OpenDota debug diagnostics
Use these checks when `/api/debug/match/:id` fails locally:

```bash
curl.exe https://api.opendota.com/api/matches/8781054570
```

```bash
node -e "const s=Date.now(); fetch('https://api.opendota.com/api/matches/8781054570').then(async r=>{const t=await r.text(); console.log({status:r.status,length:t.length,durationMs:Date.now()-s})}).catch(e=>console.error(e))"
```

`curl` может успешно вернуть JSON, а встроенный Node `fetch` (undici) в некоторых сетевых окружениях падать с `ECONNRESET`/`terminated`. В этом случае проект автоматически использует `https` fallback без дополнительных зависимостей.

Then open:

- `/api/debug/match/8781054570`

If there is an error, the response now includes `stage: "fetch"` or `stage: "normalize"` so you can see exactly where it failed.

## MVP TODO (Data quality)
- Next step: replace manual item ID subset with OpenDota `/constants/items` (or dotaconstants mirror), keeping local overrides only for display-name aliases.
- Item timing benchmark labels in MVP are **manual_mvp_threshold** only; later wire OpenDota scenarios (`/scenarios/itemTimings`) and hero item popularity.
- STRATZ integration is planned only for advanced post-match features (death location, solo deaths, first death in fight, pathing/replay context). Current OpenDota-only MVP should avoid those claims when data is missing.
