# ANALYTICS_METHODOLOGY

## Required structure for every finding
Every finding must include:
- metric;
- source;
- confidence;
- limitation.

## Source types
- `opendota_purchase_log`
- `opendota_phase_timeseries`
- `opendota_lane_fields`
- `opendota_farm_profile`
- `opendota_objectives`
- `opendota_gold_reasons_debug`
- `stratz_basic_player_stats`
- `stratz_schema_research`
- `manual_mvp_threshold`

## Rules
- STRATZ basic player stats can validate OpenDota KDA/GPM/XPM/networth.
- STRATZ cannot yet be used for first death, death location, or teamfight death order.
- OpenDota `farmProfile` represents kill counts, not gold-source distribution.
- `gold_reasons` cannot be productized until constants are decoded.
- Objective conversion must be cautious when team attribution is not confirmed.
- Death phase analysis must not be shown when death timings are unavailable.

## STRATZ research evidence levels
- **Level 1 — Schema confirmed:** field exists in introspection. Example: `MatchPlayerStatsType.deathEvents`.
- **Level 2 — Data confirmed:** query returns real data for matchId `8781054570`. Example: `deathEvents` returns `time/killer/etc`.
- **Level 3 — Normalized:** data is converted into internal normalized format. Example: `stratzDeathTimings`.
- **Level 4 — Product-ready:** metric has fallback, explanation, and safe UI copy. Example: «Смерти по фазам рассчитаны по STRATZ death events.»

Only Level 4 can be used in product UI.

## Product copy discipline
- Raw provider field names do not belong in product UI.
- Debug/research payloads are allowed only in debug routes/docs.
