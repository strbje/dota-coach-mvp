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
- research/debug provider confirmed;
- basic match + player stats confirmed;
- final item slot IDs confirmed;
- advanced fight/death/map fields not confirmed;
- `teamfights` on `MatchType` rejected by schema validation;
- next step: GraphQL Explorer or introspection route.

## Manual MVP thresholds
- Temporary fallback only when OpenDota/STRATZ benchmark data is not confirmed.
- UI phrasing: **«по MVP-ориентиру»**.
