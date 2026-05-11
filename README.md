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


## Documentation
- `docs/DATA_SOURCES.md`
- `docs/OPENDOTA_FIELDS.md`
- `docs/BENCHMARKS.md`
- `docs/BENCHMARK_RESEARCH.md`
- `docs/ANALYTICS_METHODOLOGY.md`
- `docs/STRATZ_RESEARCH.md`
- `docs/UI_COPY_RULES.md`

## API endpoints
- `POST /api/pre-game/analyze`
- `POST /api/post-match/analyze`
- `POST /api/draft/normalize`
- `GET /api/heroes`
- `GET /api/debug/env`
- `GET /api/debug/match/:id`
- `GET /api/debug/stratz/match/:id?query=basic|playerDeep|teamfightsProbe|eventsProbe|playbackProbe|heroAverageProbe`
- `GET /api/debug/stratz/schema?type=MatchType`
- `GET /api/debug/benchmarks/:heroId?matchId=8781054570`

Debug URLs:
- `/api/debug/env`
- `/api/debug/match/8781054570`
- `/api/debug/stratz/match/8781054570?query=basic`
- `/api/debug/stratz/match/8781054570?query=playerDeep`
- `/api/debug/stratz/match/8781054570?query=teamfightsProbe`
- `/api/debug/stratz/match/8781054570?query=eventsProbe`
- `/api/debug/stratz/match/8781054570?query=playbackProbe`
- `/api/debug/stratz/match/8781054570?query=heroAverageProbe`
- `/api/debug/stratz/schema?type=MatchType`

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
- `/api/debug/stratz/match/8781054570?query=basic`
- `/api/debug/stratz/match/8781054570?query=playerDeep`
- `/api/debug/stratz/match/8781054570?query=teamfightsProbe`
- `/api/debug/stratz/match/8781054570?query=eventsProbe`
- `/api/debug/stratz/match/8781054570?query=playbackProbe`
- `/api/debug/stratz/match/8781054570?query=heroAverageProbe`
- `/api/debug/stratz/schema?type=MatchType`

If there is an error, the response now includes `stage: "fetch"` or `stage: "normalize"` so you can see exactly where it failed.

## MVP TODO (Data quality)
### Immediate
- Fix STRATZ query mode selection.
- Add eventsProbe/playbackProbe/heroAverageProbe.
- Introspect STRATZ detail event types.
- Document STRATZ confirmed schema fields.
- Keep STRATZ data in debug until normalized.

### Next
- Normalize STRATZ events/playback/heroAverage into debug summaries.
- Validate deathEvents time fields.
- Validate player position samples.
- Validate farmDistributionReport.
- Validate heroAverage as benchmark candidate.

### Future
- Promote STRATZ deathsByPhase to product UI if normalized.
- Promote STRATZ death position map if coordinates validated.
- Promote STRATZ heroAverage benchmarks if methodology clear.

## Next UI (post-match)
- Use STRATZ deathsByPhase in fights card when available.
- Keep map/death-location features in research-only status until death positions are product-ready.
