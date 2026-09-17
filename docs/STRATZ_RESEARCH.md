# STRATZ_RESEARCH

## Confirmed status
- Endpoint `https://api.stratz.com/graphql` works.
- Auth with `STRATZ_API_TOKEN` works.
- Response content-type can be `application/graphql-response+json`.
- PowerShell inline JSON can break `curl.exe` arguments.
- Reliable local test uses `ConvertTo-Json` + `Set-Content` + `--data-binary @file`.

## Confirmed schema snapshot

### MatchPlayerStatsType confirms
- killEvents
- deathEvents
- assistEvents
- lastHitsPerMinute
- goldPerMinute
- experiencePerMinute
- heroDamagePerMinute
- towerDamagePerMinute
- itemPurchases
- itemUsed
- actionReport
- locationReport
- farmDistributionReport
- heroDamageReport
- inventoryReport
- networthPerMinute
- campStack
- impPerMinute
- heroDamageReceivedPerMinute
- wardDestruction

### MatchPlayerPlaybackDataType confirms
- playerUpdatePositionEvents
- playerUpdateGoldEvents
- playerUpdateHealthEvents
- playerUpdateBattleEvents
- killEvents
- deathEvents
- assistEvents
- csEvents
- goldEvents
- experienceEvents
- heroDamageEvents
- towerDamageEvents
- inventoryEvents
- purchaseEvents
- buyBackEvents
- runeEvents

### HeroPositionTimeDetailType confirms potential benchmarks
- matchCount
- winCount
- kills/deaths/assists
- networth
- xp
- cs
- neutrals
- heroDamage
- towerDamage
- goldPerMinute
- teamKills
- goldLost/goldFed
- buybackCount
- ancients
- kDAAverage
- killContributionAverage

## Current conclusions
- STRATZ is now a strong candidate for enriched post-match analytics.
- STRATZ likely can provide death timings through player stats/playback events.
- STRATZ likely can provide position/map context through playerUpdatePositionEvents and locationReport.
- STRATZ likely can provide farm distribution through farmDistributionReport.
- STRATZ likely can provide benchmarks through heroAverage.
- All of these still require data probes and field-level validation before product use.

### Farm probe boundary
- `csEvents` and `goldEvents`: only the queried `time` field is currently normalized for research; event value/source semantics are not inferred.
- `farmDistributionReport`: retained as a raw research preview. Keys such as lane/neutral/objective are not normalized until an actual response and schema field meanings are captured.
- `networthPerMinute`: its type is known from schema research, but no validated match payload is available to align it with `heroAverage.networth` checkpoints.
- Therefore phase hero+position comparisons remain research-only and are not rendered in product UI.

## Product readiness
Ready for debug:
- basic player stats
- playerDeep stats
- schema introspection
- eventsProbe
- playbackProbe
- heroAverageProbe

Not ready for product UI:
- first death in fight
- solo death
- death location
- farm source breakdown from STRATZ
- STRATZ benchmarks
until actual query data is validated.

## Confirmed working query: basic
```graphql
query DebugStratz($id: Long!) {
  match(id: $id) {
    id
    players {
      steamAccountId
      heroId
    }
  }
}
```

## Confirmed working query: playerDeep
```graphql
query DebugStratzPlayerDeep($id: Long!) {
  match(id: $id) {
    id
    durationSeconds
    didRadiantWin
    averageImp
    players {
      steamAccountId
      playerSlot
      isRadiant
      isVictory
      heroId
      kills
      deaths
      assists
      numLastHits
      numDenies
      goldPerMinute
      experiencePerMinute
      networth
      level
      gold
      goldSpent
      heroDamage
      towerDamage
      heroHealing
      lane
      position
      role
      roleBasic
      imp
      award
      item0Id
      item1Id
      item2Id
      item3Id
      item4Id
      item5Id
      backpack0Id
      backpack1Id
      backpack2Id
      neutral0Id
    }
  }
}
```

## Confirmed data: match `8781054570` / Lifestealer
- `heroId`: 54
- `KDA`: 19 / 9 / 18
- `GPM`: 760
- `XPM`: 990
- `networth`: 47587
- `level`: 30
- final item IDs: `603, 147, 135, 168, 208, 112`

## Rejected / not confirmed
- `teamfights` is not a field on `MatchType`.
- Query `match(id) { teamfights { ... } }` returns: `Cannot query field "teamfights" on type "MatchType"`.

## Debug routes
- `GET /api/debug/stratz/match/:id?query=basic`
- `GET /api/debug/stratz/match/:id?query=playerDeep`
- `GET /api/debug/stratz/match/:id?query=teamfightsProbe`
- `GET /api/debug/stratz/match/:id?query=eventsProbe`
- `GET /api/debug/stratz/match/:id?query=playbackProbe`
- `GET /api/debug/stratz/match/:id?query=heroAverageProbe`
- `GET /api/debug/stratz/schema?type=MatchType`

## Schema discovery instruction
1. Try introspection route first: `/api/debug/stratz/schema?type=MatchType`.
2. Probe detail types through `/api/debug/stratz/schema?type=...`:
   - MatchPlayerStatsKillEventType / MatchPlayerStatsDeathEventType / MatchPlayerStatsAssistEventType
   - KillDetailType / DeathDetailType / AssistDetailType
   - MatchPlayerItemPurchaseEventType / ItemPurchaseType
   - GoldDetailType / LastHitDetailType / ExperienceDetailType
   - MatchPlayerStatsFarmDistributionReportType / MatchPlayerStatsLocationReportType
   - PlayerUpdatePositionDetailType / PlayerUpdateBattleDetailType / PlayerUpdateHealthDetailType / PlayerUpdateGoldDetailType / PlayerUpdateAttributeDetailType
   - HeroDamageDetailType / TowerDamageDetailType / MatchPlayerStatsHeroDamageReportType
   - MatchPlayerStatsActionReportType / MatchPlayerInventoryType
   - MatchPlaybackDataRoshanEventType / MatchPlaybackDataBuildingEventType / MatchPlaybackDataTowerDeathEventType / MatchPlaybackDataWardEventType
3. If introspection is blocked/denied, use STRATZ GraphQL Explorer.
4. Only after field confirmation + data confirmation, promote findings from research/debug to product-ready.

Do not build product conclusions like **first death in fight**, **solo death**, or **death location** until schema fields and data payloads are confirmed.

## Validated data probes

### eventsProbe
- Returned: `match.chatEvents[]`, `players[].stats.killEvents[]`, `deathEvents[]`, `assistEvents[]`.
- `deathEvents` are returned for the selected Lifestealer player (heroId 54) and normalized in debug route.
- `time` fields are normalized via `formatGameTime` when present.
- `deathsByPhase` is calculated only when `time` exists.
- Research heuristic added as **first death in kill cluster** (not teamfight): debug-only, `productReady=false`.

### playbackProbe
- Position events are returned from `players[].playbackData.playerUpdatePositionEvents[]`.
- Coordinates may arrive as `x/y` or `positionX/positionY`; normalized when present.
- Objective playback is returned from match playback (`roshan/building/tower/ward`) with compact previews.
- Death time to nearest position mapping is available as research-only (`productReady=false`).

### heroAverageProbe
- `players[].heroAverage[]` is returned and normalized for selected player.
- Time samples are previewed (first 5 + targeted 10/20/30/40 checks if present).
- This is not product benchmark yet: `productReady=false` until methodology is fully confirmed.

### heroAverage methodology checklist (before product use)
- `time`: meaning still unconfirmed (likely minute bucket / checkpoint, but not documented in API response itself).
- sampling: selection logic for `heroAverage` population is unconfirmed (global/rank/patch/region filters unknown).
- `position`: field exists in payload, but benchmark grouping semantics still unconfirmed.
- data period: rolling window/patch binding is unconfirmed.
- rank/bracket: unconfirmed in returned payload.
- stability: values are returned, but consistency across matches/heroes needs repeated probes.
- **Policy:** use `heroAverage` only for research/debug until all points above are confirmed from schema/docs/explorer.

## Role detection policy (vNext integration target)
- Do not hardcode `Lifestealer carry` as the only role signal in product decisions.
- Prefer runtime role detection from available sources in this priority:
  1) STRATZ `position`
  2) STRATZ `role` + `lane`
  3) STRATZ `roleBasic` + `lane`
  4) OpenDota `lane_role` / `lane`
- If detected role is carry/core, apply carry rules + optional hero-specific overrides.
- If role is unknown/conflicting, fallback to hero/lane stats and keep role conclusions soft (no strict claim).

## STRATZ product readiness levels
- Level 1 schema confirmed
- Level 2 data returned
- Level 3 normalized
- Level 4 product-ready

## 2026-05-09 validation snapshot

### eventsProbe validated
- killEventsCount: 19
- deathEventsCount: 9
- assistEventsCount: 18
- deathTimings: available
- deathsByPhase: available
- match 8781054570: laning 2, earlyMid 0, midGame 0, lateGame 7

### playbackProbe validated
- positionSamplesCount: 2842
- objectivePlaybackSummary: available
- towerDeathEventsCount: 32
- wardEventsCount: 368
- deathPositionSamples: empty
- coordinates: not product-ready in normalized preview

### Product readiness
- deathsByPhase: Level 4 (product-ready)
- deathTimings: Level 4 (product-ready)
- death position: Level 2/3 (research only)
- objective playback: Level 2/3 (research only)
- heroAverage: research only

## Issue #55 methodology decision (2026-09-17)

### Scope and evidence standard

This review does **not** enable `heroAverage` in product scoring. It reviewed the current
post-#34/#54 query, adapter, debug and scoring paths and treats only these as confirmation:

1. a field and its GraphQL type/description in the STRATZ schema;
2. an explicit STRATZ documentation statement; or
3. a value observed in a captured live payload.

A field name, plausible value, or correlation is not methodology evidence. The existing
product boundary remains intact: `normalizeStratzHeroAverage` labels methodology as
`unknown`, and carry rules expose any comparison as research-only without changing a
score.

### What the schema and current payload contract establish

| Field | Confirmed | Unknown |
|---|---|---|
| `time` | `HeroPositionTimeDetailType` exposes the numeric field; rows can be queried. | Unit, bucket boundary, interpolation, whether it is elapsed game minute, and exact alignment to either provider's array index. |
| `position` | Both match player and average row expose a position value. | Whether it is an input cohort filter, an output dimension, inferred role, and whether rows with another position are excluded. |
| `cs` | Numeric average-row field exists. | Definition (last hits only versus broader CS), aggregation and rounding. |
| `networth` | Numeric average-row field exists; match stats expose `networthPerMinute`. | Whether both use the same snapshot clock, population and aggregation. |
| `goldPerMinute` | Numeric average-row field exists. | Point-in-time versus cumulative definition, cohort and aggregation. It is not net worth. |
| `matchCount` / `winCount` | Numeric fields exist per row. | Whether counts are per hero, hero+position, time-survivor cohort, patch/window or another hidden cohort; treatment of abandoned/short games. |
| selected `position` | The containing match player exposes it independently of each row. | Whether STRATZ used that value to select `heroAverage` rows. |

No reviewed schema description, repository document, or captured payload states the
cohort construction. Consequently all of these remain **unknown**: hero-only versus
hero+position; patch/game-version binding; rank/bracket; region; rolling/calendar window;
lobby/game mode; minimum sample; exclusions and other hidden STRATZ filters. Match-level
`gameVersionId`, `lobbyType` and `gameMode` describe the subject match only and cannot be
promoted to cohort filters.

### Live-probe status and reproducible artifact

The required subject match remains `8781054570` (Lifestealer, hero 54, observed earlier as
position/carry context). On 2026-09-17 this checkout could not complete authenticated live
probes: `STRATZ_API_TOKEN` is unset, GitHub CLI has no authentication, and outbound API
requests are rejected by the environment proxy. Therefore no new live values, two extra
match IDs, heroes, positions or durations are invented here. The earlier repository
snapshot for `8781054570` confirms final match stats only (19/9/18, 760 GPM, 47,587 final
net worth); it did not preserve `heroAverage` samples and cannot answer #55.

This is an explicit incomplete-probe result, not evidence of an empty STRATZ response.
Because three successful live probes are a required acceptance condition, their absence
alone prevents A or B.

`scripts/probe-stratz-hero-average.mjs` is the deterministic capture path for the next
authenticated run. It:

- requires at least three explicit `matchId:heroId` targets, including
  `8781054570:54`;
- records match ID, hero, actual position, duration/context, every returned average sample,
  and its `matchCount`/`winCount`;
- records the `time-1`/`time`/`time+1` candidate-index windows for actual CS from both
  STRATZ `lastHitsPerMinute` and OpenDota `lh_t`;
- records the same window for actual net worth only from STRATZ `networthPerMinute`, plus
  final last hits for later monotonicity/final-total review;
- records the same candidate-index window for STRATZ `stats.goldPerMinute` and the confirmed
  top-level final `goldPerMinute`, without calculating a delta or asserting equivalence;
- deliberately never requests or compares OpenDota `gold_t`;
- labels array-index alignment as a candidate until timestamps/bucket semantics are proven.

Example (the other targets must be real, deliberately selected matches rather than guessed
IDs):

```bash
STRATZ_API_TOKEN=... node scripts/probe-stratz-hero-average.mjs \
  8781054570:54 <match-2>:<hero-2> <match-3>:<hero-3> \
  --out=docs/fixtures/stratz-hero-average-live.json
```

A capture is acceptable only after manually checking distinct heroes/positions/durations,
redacting account identifiers, and repeating at least one target later to measure benchmark
stability. This review does not commit a fabricated fixture.

### Metric-equivalence decision

| Candidate comparison | Status | Reason |
|---|---|---|
| OpenDota `lh_t` → `heroAverage.cs` | **research-only** | Both are available to the probe, but `cs` definition and exact checkpoint clock are not documented or live-validated. Equal-looking samples would show correlation, not semantic identity. |
| STRATZ `stats.lastHitsPerMinute` → `heroAverage.cs` | **research-only** | Same provider reduces cross-provider risk, but field definitions and temporal alignment remain unknown. |
| STRATZ `stats.networthPerMinute` → `heroAverage.networth` | **research-only** | This is the only permissible net-worth candidate; equivalence and checkpoint timing remain unconfirmed. |
| OpenDota `gold_t` → `heroAverage.networth` | **invalid / do not use** | Gold and net worth are different metrics. The probe intentionally excludes this comparison. |
| actual match GPM → `heroAverage.goldPerMinute` | **research-only** | Schema exposes both, but point/cumulative semantics and cohort methodology are unconfirmed. |
| `matchCount` / `winCount` as guards | **research-only** | Counts are observable, but their denominator/cohort and time-survivorship behavior are unknown. |

Temporal alignment must be proven rather than inferred from an integer `time`: for each
sample, establish the unit and boundary, compare the STRATZ actual array at adjacent indexes,
verify cumulative CS monotonicity/final total behavior, and verify net-worth snapshots around
that boundary. Until then the probe preserves raw candidate values and computes no deltas.

### Stability checks required before reconsideration

For each of at least three successful probes, preserve match ID, hero ID, actual position,
duration, actual CS checkpoints, conditionally actual STRATZ net-worth checkpoints, complete
average samples and counts. Then test:

1. rows within a match consistently identify the expected hero and position;
2. the same hero+position rows returned from different matches are identical or explainably
   versioned;
3. `matchCount` does not silently change by subject rank, region, mode or duration;
4. repeated captures disclose whether the benchmark is rolling;
5. later checkpoints do not use an unexplained survivor-only population.

A value change is not itself proof of a rolling window; an unchanged value is not proof of a
fixed cohort.

### Interim product decision: **C — research-only**

`heroAverage` must not be returned to product scoring. The decisive blockers are the absent
cohort definition, unproven metric equivalence, unproven checkpoint alignment, unknown sample
meaning, and the missing three successful live probes. Schema presence confirms transport,
not fitness for scoring. Current OpenDota benchmarks and every scoring/death/fight/player
selection rule remain unchanged. This is sufficient reason not to promote the metric, but it
is not final evidence about STRATZ methodology.

Issue #55 research remains incomplete and must stay open, blocked on capturing and reviewing
the required authenticated live probes.

Promotion to B requires successful diverse probes plus reliable metric/time alignment while
cohort construction is still opaque. Promotion to A additionally requires authoritative
cohort documentation (hero/position, version/window, bracket, region/mode and exclusions),
a defensible minimum-sample policy, and stability validation. No future integration formula
is proposed under the interim decision C because doing so would encode unsupported methodology.
