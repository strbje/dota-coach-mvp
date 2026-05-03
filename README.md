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
- `GET /api/debug/match/:id`

## Notes
- No database/auth/realtime overlay in v1.
- STRATZ token is used only server-side in `src/lib/dota/clients/stratz.ts`.
- If provider fields change, adapters isolate the uncertainty and preserve stable response shapes.
