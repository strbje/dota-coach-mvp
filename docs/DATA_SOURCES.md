# DATA_SOURCES

## OpenDota (primary MVP source)

### Product-ready data (confirmed)
- item timings from `purchase_log`;
- phase economy from `gold_t` / `lh_t` / `xp_t`;
- lane review from `lane_efficiency` / `lane_efficiency_pct` / `lh_t`;
- farm profile from `lane_kills` / `neutral_kills` / `ancient_kills` / `hero_kills` / `tower_kills` / `roshan_kills`;
- objective events with cautious attribution;
- kill participation from team kills.

### Research/debug data
- `gold_reasons` exists, but constants decoding is currently unresolved;
- raw objective types;
- possible `teamfights` payload if present in raw response.

### Unavailable for current match snapshot
- death timings;
- deaths by phase;
- phase fight participation;
- first death in fight.

## OpenDota constants
- Endpoint: `/constants/{resource}`.
- Fallback: dotaconstants mirror.
- Scope: hero IDs, item IDs, `gold_reasons`, and enum mappings.

## STRATZ status

### STRATZ confirmed
- GraphQL endpoint works.
- Auth works.
- Basic player stats work.
- Final item slots work.
- MatchPlayerStatsType exposes kill/death/assist events and per-minute arrays.
- MatchPlayerPlaybackDataType exposes position/gold/health/battle updates and kill/death/assist/purchase events.
- MatchPlaybackDataType exposes Roshan/building/tower/ward events.
- HeroPositionTimeDetailType exposes potential hero/position benchmark data.

### STRATZ not yet productized
- first death in fight
- solo death
- death location
- pathing
- farm source breakdown
- heroAverage benchmarks

## Manual MVP thresholds
- Temporary fallback only when OpenDota/STRATZ benchmark data is not confirmed.
- UI phrasing: **«по MVP-ориентиру»**.

### STRATZ probes (confirmed, debug-only)
- `eventsProbe` confirmed and normalized into compact debug summary.
- `playbackProbe` confirmed and normalized (positions + objective playback preview).
- `heroAverageProbe` confirmed and normalized as benchmark candidate preview.
- Still research/debug only; product usage requires stable normalization and explicit UI copy gating.
