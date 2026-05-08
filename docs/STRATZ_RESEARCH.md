# STRATZ_RESEARCH

STRATZ API использует GraphQL и потенциально может дать более глубокие replay/playback данные.

## Потенциальные use cases
- death locations;
- first death in fight;
- solo deaths;
- deaths far from allies;
- pathing;
- fight entry;
- richer farm breakdown;
- item benchmark context;
- IMP-like performance signal.

## Fields to verify via GraphQL Explorer
1. Есть ли match by id?
2. Есть ли player-level item timings?
3. Есть ли death events with time?
4. Есть ли death location coordinates?
5. Есть ли teamfight events?
6. Есть ли order of deaths inside teamfight?
7. Есть ли nearby allies / player positions?
8. Есть ли farm breakdown by source?
9. Есть ли lane outcome/role benchmark?
10. Есть ли hero-role item timing benchmarks?

## Debug route
- `GET /api/debug/stratz/match/:id`.
- Без токена: `{ ok: false, hasToken: false, error: "STRATZ_API_TOKEN missing" }`.
- С токеном: минимальный GraphQL debug-запрос, без продуктовых выводов.
