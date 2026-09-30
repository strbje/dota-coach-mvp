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

## Live validation update (2026-09-29)

This section supersedes the live-probe blocker and the provisional evidence summary dated
2026-09-17. The raw capture was supplied out of band and is intentionally not committed
because it contains provider payload data. Its provenance is fixed here so the reviewed
result is reproducible:

- `capturedAt`: `2026-09-29T18:08:33.928Z`;
- file: `stratz-hero-average-live.json`, 205,735 bytes;
- SHA-256: `e1fbaa3ab52d6fa2e6fd1a680a01bda540071452ae875315d9d19c6456253901`.

### Successful probes

| Match | Selected hero | Duration | Position | Game version | Average rows |
|---|---|---:|---|---:|---:|
| `8781054570` | Lifestealer (`54`) | 78:52 | `POSITION_1` | 186 | 66 (`time` 0–65) |
| `9019592113` | Wraith King (`42`) | 37:58 | `POSITION_1` | 190 | 38 (`time` 0–37) |
| `9003795847` | Wraith King (`42`) | 29:53 | `POSITION_1` | 190 | 30 (`time` 0–29) |

All three subject matches were `RANKED` / `ALL_PICK_RANKED`; selected players had
`role=CORE` and `roleBasic=CORE`. In all 134 returned average rows, `heroId` and `position`
matched the selected player. This confirms the observed rows only. It does not establish
that position is the complete population filter, and this capture did not exercise another
position.

### Actual last hits are interval values; OpenDota `lh_t` is cumulative

| Match | OpenDota `lh_t[10]` | Sum of STRATZ `lastHitsPerMinute[0..9]` | STRATZ bucket `[10]` |
|---|---:|---:|---:|
| `8781054570` | 45 | 45 | 3 |
| `9019592113` | 51 | 51 | 8 |
| `9003795847` | 52 | 52 | 16 |

For the available comparable intervals, the hypothesis
`STRATZ[i] ≈ OpenDota[i+1] - OpenDota[i]` produced 62/66 exact matches for Lifestealer
(the other four differed by ±1), 37/37 for Wraith King `9019592113`, and 27/29 for Wraith
King `9003795847` (the other two differed by ±1). The running provider difference stayed
within 0–1, and all three sums through index 9 equalled OpenDota `lh_t[10]`.

This is empirical evidence that this capture's STRATZ `lastHitsPerMinute` entries are
interval counts and OpenDota `lh_t` entries are cumulative counts. It is not a universal
cross-provider identity or permission to add tolerance/scoring. A single STRATZ interval
must never be compared directly with cumulative LH or `heroAverage.cs`.

### Benchmark population is not a fixed hero + position + version table

The two Wraith King matches share hero, `POSITION_1`, game version 190, lobby and mode, but
none of their 30 common complete `heroAverage` rows are identical.

| Raw `time` | Field | Match `9019592113` | Match `9003795847` |
|---:|---|---:|---:|
| 10 | `matchCount` | 6,564 | 7,766 |
| 10 | `winCount` | 3,563 | 4,230 |
| 10 | `cs` | 44.36 | 44.33 |
| 10 | `networth` | 3,608.55 | 3,616.83 |
| 20 | `cs` | 144.14 | 143.48 |
| 20 | `networth` | 9,155.59 | 9,144.76 |
| 20 | `matchCount` | 6,529 | 7,747 |

The cause is unknown. Additional filters, historical windows, cache state and refreshes are
possibilities, not findings. In particular, `cs=44.36` at raw `time=10` is not a confirmed
10:00 norm and must not be compared with an actual value of 51 in product copy.

`matchCount` also changes by row: 20,623 at raw time 10 to 13,719 at 35 and 357 at 65 for
Lifestealer; 6,564 at 10 to 4,382 at 35 and 3,816 at 37 for Wraith King `9019592113`; and
7,766 at 10 to 7,069 at 29 for Wraith King `9003795847`. The denominator is therefore not
constant across the curve. A survivor cohort is plausible but not documented and must not
be asserted.

### Metric and clock findings

- `heroAverage.goldPerMinute` was `null` in all 134/134 rows. Actual per-minute and final GPM
  do not replace a missing benchmark. Null must remain null, and GPM average comparison is
  unavailable for this capture.
- Each actual STRATZ net-worth series begins at 600. Average rows at raw `time=0` were
  127.77, 161.67 and 154.36; at raw `time=1` they were 606.51, 611.08 and 608.80, with
  `cs=0.01`. This warrants testing a pre-game point/index offset, but proves neither one.
- The old artifact called `sample.time` “minute”. The probe now exports it as `rawTime` plus
  a separate `candidateArrayIndex`; it makes no silent ±1 correction.
- Net-worth resemblance does not establish snapshot alignment or equivalence. Net worth is
  still evaluated separately from the interval/cumulative last-hit observation.

### Probe correction and safe reproduction

The reviewed capture stored actual windows only around returned average rows. Consequently
its Lifestealer actual export ended at index 66 although the match lasted 78:52. Its visible
LH sum of 562 cannot be compared with final LH 676 as evidence of provider data loss. For
Wraith King `9019592113`, 295 LH through 37:00 versus final 302 requires explicit treatment
of the last partial minute; it must not be filled with zero. Wraith King `9003795847` had
281 through 29:00 and 281 final LH.

The probe now preserves complete actual provider arrays and their lengths independently of
average-row coverage, names interval and cumulative series separately, retains raw average
time, and never queries Steam/account identifiers. It still records adjacent-index windows
for inspection but calculates no unsupported benchmark delta. Run the same targets again to
investigate stability:

```powershell
node --env-file=.env.local scripts/probe-stratz-hero-average.mjs `
  "8781054570:54" "9019592113:42" "9003795847:42" `
  --out=stratz-hero-average-repeat.json
```

A repeat can distinguish some time-of-capture changes from subject-match differences, but a
single repeat cannot reveal every hidden filter. Keep tokens in `.env.local`; do not commit
raw captures before checking them for identifiers.

The debug schema endpoint now requests type and field `description` values in addition to
names and types. The accessible STRATZ pages did not provide definitions for these fields in
text available during this review, and direct introspection returned HTTP 403. That is an
access limitation, not evidence that STRATZ has no documentation. The semantics of
`HeroPositionTimeDetailType.time`, `cs`, and `heroAverage` on the player type therefore
remain unconfirmed.

### Per-metric readiness after live validation

| Candidate | Status | Decision |
|---|---|---|
| `heroAverage.cs` | **research-only** | Average field exists, but clock and CS definition are unconfirmed; actual STRATZ LH is interval data while OpenDota LH is cumulative. |
| `heroAverage.networth` | **research-only** | Values exist, but raw-time alignment, snapshot boundary and population equivalence are unconfirmed. |
| `heroAverage.goldPerMinute` | **research-only / unavailable in capture** | All 134 values are null; never coerce them to zero or substitute actual GPM. |
| `matchCount` / `winCount` guardrails | **research-only** | Denominator varies with raw time and cohort construction is unknown. |
| `position` filtering | **research-only** | All observed rows matched `POSITION_1`, but no other role was tested and hidden cohort filters are unknown. |

### Decision: **C — research-only**

The three-live-probe acceptance condition is now met, but the result does not justify B or
A. `heroAverage` remains excluded from numeric scoring and product conclusions because:

1. the meaning and boundary of `time` are not authoritatively established;
2. actual and average CS/net-worth metric equivalence is not established;
3. two otherwise matching Wraith King subjects received different curves and populations;
4. row-level sample denominators vary and cohort methodology remains undocumented; and
5. the GPM benchmark is absent in every captured row.

No OpenDota benchmark, death/fight rule, or score changes as a result of this research.
Issue #59 can proceed independently, and factual economy values from #34 remain usable
without normative `heroAverage` claims. Reconsider C only after authoritative field/cohort
definitions and a targeted repeat capture explain, or safely bound, the observed differences.

## Repeat validation and cohort-field probe extension (2026-09-30 MSK)

### Repeat artifact provenance

The owner supplied a successful repeat after the earlier `ECONNRESET`. Both raw files were
shared out of band and are intentionally not committed:

| Artifact | `capturedAt` (UTC) | Bytes | SHA-256 |
|---|---|---:|---|
| `stratz-hero-average-live.json` | `2026-09-29T18:08:33.928Z` | 205,735 | `e1fbaa3ab52d6fa2e6fd1a680a01bda540071452ae875315d9d19c6456253901` |
| `stratz-hero-average-repeat.json` | `2026-09-29T21:49:00.536Z` | 223,891 | `104f4a9e621680dd45b67c748f272a0a2b43e73f2129f8e0fd7047a0a7ad5978` |

The completion timestamps are 3 h 40 min 26.608 s apart. They are capture completion
times, not STRATZ refresh timestamps. The cause of the prior connection reset remains
unknown; the successful retry does not identify whether STRATZ, OpenDota, a VPN or another
network component reset that connection.

### Observed benchmark changes

Comparison used the provider's raw `heroAverage.time` and every provider field. The local
export rename from `minute` to `rawTime` / `candidateArrayIndex` was not treated as a
provider-data change.

| Match / hero | Changed rows | `matchCount` at raw time 10, first → repeat |
|---|---:|---:|
| `8781054570`, Lifestealer | 0 / 66 | 20,623 → 20,623 |
| `9019592113`, Wraith King | 38 / 38 | 6,564 → 6,788 |
| `9003795847`, Wraith King | 0 / 30 | 7,766 → 7,766 |

For match `9019592113`, `matchCount`, `winCount` and `networth` changed in every row and
`cs` changed in 29/38 rows. At raw time 10, `winCount` changed 3,563 → 3,675, `cs` remained
44.36 and `networth` changed 3,608.55 → 3,608.47. At raw time 20, `matchCount` changed
6,529 → 6,751, `cs` 144.14 → 144.09 and `networth` 9,155.59 → 9,153.93. At raw time 37,
`matchCount` changed 3,816 → 3,959, `cs` 324.81 → 324.91 and `networth` 21,497.17 →
21,507.52.

This confirms that the returned benchmark for a match ID is not an immutable snapshot. Two
captures do not establish why: sample growth/recalculation, cache behavior and other
mechanisms remain hypotheses. In particular, a `matchCount` increase of 224 is not proof
that exactly 224 newly played matches entered the population. In the repeat, the two Wraith
King curves still differed in all 30 common complete rows despite matching hero, position,
game version, lobby and mode. Those metadata therefore do not explain the population
difference.

### Actual-series stability and complete-series boundary

Match metadata and final statistics did not change. All 536 previously exported non-null
actual values matched the corresponding values in the complete repeat arrays: 268, 150 and
118 values for the three matches. Complete repeat lengths were:

| Match | STRATZ interval LH | OpenDota cumulative `lh_t` | STRATZ net worth | STRATZ GPM |
|---|---:|---:|---:|---:|
| `8781054570` | 78 | 79 | 79 | 78 |
| `9019592113` | 37 | 38 | 38 | 37 |
| `9003795847` | 29 | 30 | 30 | 29 |

The Lifestealer interval-LH sum is 676, equal to both final LH and the last OpenDota
checkpoint. The old export covered indexes 0–66 and summed to 562; indexes 67–77 add 114.
`heroAverage` still ends at raw time 65, confirming that actual arrays must remain independent
of benchmark coverage.

For match `9019592113`, 37 intervals sum to 295 while the last OpenDota checkpoint is 295
and final LH is 302. The match ended at 37:58 and there is no separate interval element for
the final partial minute. The probe must neither append a zero nor present 295 as the final
match total. For match `9003795847`, 29 intervals sum to the final 281; that equality alone
does not prove that a partial-minute bucket was exported.

Across the complete rows, `STRATZ[i]` equaled `OpenDota[i+1] - OpenDota[i]` for 72/78,
37/37 and 27/29 intervals respectively; each mismatch was ±1 and the running difference
remained within 0–1. Sums of the first ten STRATZ intervals again equaled the OpenDota
checkpoint at index 10: 45, 51 and 52. This remains an empirical observation, not a provider
contract.

### New schema fields and capture status

The supplied `HeroPositionTimeDetailType` introspection confirms these transport types. The
type and all 74 field descriptions were `null`:

| Field | Introspected type | Confirmed meaning |
|---|---|---|
| `week` | `Int!` | None; format, period boundary and relationship to the population are unknown. |
| `bracketBasicIds` | nullable `RankBracketBasicEnum` | None; despite its name it is one enum value, not a list. |
| `remainingMatchCount` | nullable `Long` | None; relationship to row-level `matchCount` is unknown. |

The probe now requests and preserves all three values inside each raw `heroAverage` row,
including nullable values. The schema debug route also returns `RankBracketBasicEnum`
values, descriptions and deprecation metadata when introspection makes them available:

```text
GET /api/debug/stratz/schema?type=RankBracketBasicEnum
```

No authoritative textual field definitions were found in the accessible official STRATZ
material. That failed lookup does not establish that definitions do not exist. Enum names
also do not establish bracket semantics without descriptions or provider documentation.

The first two owner-supplied captures did not query the three fields. The expanded
capture has now been supplied and validated; its results and provenance follow below.
Historical values of the three new fields still cannot be reconstructed from the older
files. Do not request another unchanged capture to rediscover those results.

The probe applies a 30-second timeout through response-body reading, reports provider and
match context on transport/parse failures without logging authorization data, emits progress
to stderr, and writes the artifact only after every target succeeds. A partial run is not a
successful capture.

### Remaining unknowns and decision

- `heroAverage.goldPerMinute` remained null in all 134 repeat rows.
- Values of the three cohort fields are now available (below); their definitions and
  cross-capture stability remain unconfirmed.
- The definition and clock boundary of `time`, definitions of `cs` / `networth`, and full
  population rules remain unconfirmed.
- New cohort fields, even when captured, cannot by themselves prove clock alignment or
  metric equivalence.

The decision remains **C — research-only**. No STRATZ norm, grade or actual-to-average
comparison is added to product UI or scoring. Factual economy work and unrelated role rules
remain independent of this unresolved benchmark methodology.

## Expanded capture received (2026-09-30)

| Artifact | `capturedAt` (UTC) | Bytes | SHA-256 |
|---|---|---:|---|
| `stratz-hero-average-cohort-fields.json` | `2026-09-30T00:06:19.740Z` | 238251 | `c6d91efccd0f632ee104ee094742e514440d0769f43e3085e6fbf0d12f31ab3c` |
| `stratz-bracket-enum.json` | Not recorded by that endpoint version | 980 | `6999522985cf5b18467d78b820fca49da342c507584dd429f784e4da8f4c91e3` |

These owner-supplied raw files remain outside Git.

| Match | Rows | Constant raw `week` | `matchCount` at raw time 10, captures 1 → 2 → 3 |
|---|---:|---:|---|
| 8781054570 | 66 | 2937 | 20623 → 20623 → 20623 |
| 9019592113 | 38 | 2960 | 6564 → 6788 → 6951 |
| 9003795847 | 30 | 2958 | 7766 → 7766 → 7766 |

In all 134 rows `bracketBasicIds` is null, `remainingMatchCount == matchCount`, and
`goldPerMinute` is null. Null does not mean ALL; equality does not define either counter.
Between captures 2 and 3, all 582 actual-series values are identical (314 / 150 / 118).
Only WK 9019592113 changed its benchmark, in all 38 rows; the other two curves stayed
identical on their shared fields. Newly requested fields are excluded from that comparison.
The two WK curves still differ at all 30 common raw times and now have different weeks.

The live enum has UNCALIBRATED, HERALD_GUARDIAN, CRUSADER_ARCHON, LEGEND_ANCIENT,
DIVINE_IMMORTAL, FILTERED and ALL. Descriptions are null; none is deprecated. The four
paired categories do not expose separate Ancient, Divine or Immortal selectors through
this enum. Neither the player's historical rank nor implicit heroAverage rank selection
has been established.

## External research and controlled experiment (2026-09-30)

### Sources and what they actually support

- [STRATZ, IMP: Decoding Your Performance (2021-01-16)](https://medium.com/stratz/imp-decoding-your-performance-c251dcb42b93):
  historical graph averages account for hero, rank, position and match duration, without
  accounting for team compositions. This is not the full current heroAverage resolver
  contract. An average difference is not an IMP score or proof of a tactical mistake.
- [STRATZ, Supdate 3 (2019-11-09)](https://medium.com/stratz/supdate-3-the-search-edition-449ae4e104b5):
  historical weekly statistics updates; not a definition of today's output week encoding.
- [Public schema snapshot, 2025-09-13](https://github.com/boilingRage/stratz_schema/blob/6223022a7765c033eee13fb5b36b9b5415467afc/schema.graphql):
  `HeroStatsQuery.stats` returns HeroPositionTimeDetailType with explicit hero, position,
  bracket, week and time filters. Argument descriptions identify input `week` as an epoch
  timestamp, with the current week used on omission. This third-party snapshot is not a
  current authenticated introspection. Its numeric 0–8 rank prose conflicts with its
  coarse enum type and must not be adopted as a verified rank mapping.
- [Independent Dota coach implementation](https://github.com/atlonis/dota2-coach-skill/blob/88517196041f5644b27aca303aadc81f870ccffe/dota2-match-coach/scripts/lib/baseline.mjs):
  uses epoch-week indices and passes `weekIndex * 604800` as input to stats, with explicit
  hero, position and bracket. This is a primary source for that author's implementation,
  not an authoritative STRATZ definition. Its direct minute mapping and aggregation
  weights have not been validated here and are not copied.
- [Official knowledge base](https://github.com/STRATZ-Esports/knowledge-base):
  reviewed for definitions; IMP and Legitimate Match documentation cannot automatically
  be applied to heroAverage. No precise definition of its clock, cs or counters was found.

Descriptions on resolver **arguments** were missing from our introspection query, so null
field descriptions did not exhaust available documentation. Both the debug route and the
new probe mode now retain arguments, descriptions, default values and nested type wrappers.
The debug route treats HTTP failure and a missing type as unavailable, rather than an empty
successful schema, and bounds fetching/body reading to 30 seconds.

### Week hypothesis, not a product conversion

If output week is `floor(unixSeconds / 604800)`, candidate half-open UTC intervals are:

| Raw week | Candidate start | Candidate end (exclusive) |
|---:|---|---|
| 2937 | 2026-04-16 00:00 | 2026-04-23 00:00 |
| 2958 | 2026-09-10 00:00 | 2026-09-17 00:00 |
| 2960 | 2026-09-24 00:00 | 2026-10-01 00:00 |

The changing curve would belong to the capture's current week. That is consistent with
an accumulating weekly sample; it does not establish the mechanism, week-to-match-date
mapping or immutability of closed weeks. Never pass the raw index as if it were the
input epoch timestamp. The experiment labels both values and the conversion hypothesis.

### One targeted capture

After applying this patch, with the existing token in `.env.local` and working access to
STRATZ/OpenDota, run from PowerShell. Next.js does not need to be running:

```powershell
cd D:\dota-coach
node --env-file=.env.local scripts/probe-stratz-hero-average.mjs "8781054570:54" "9019592113:42" "9003795847:42" --cohort-study --out=stratz-controlled-study.json
```

This uses the existing script and dependencies; without `--cohort-study` the original
capture stays available. The single JSON contains:

1. Authenticated schema descriptions, argument definitions, enum values and request times.
2. The existing full actual series and unmodified heroAverage rows for the three targets.
3. OpenDota `times`, `lh_t`, optional `networth_t`, match start and observed creep totals.
   Collected gold is not substituted for net worth. A missing clock remains missing.
4. STRATZ match start/rank/bracket (not player rank), the selected player's timestamped
   `csEvents` flags and net-worth updates, and a separately timestamped heroAverage capture
   also requesting `neutrals` / `ancients`. These fields exist in the inspected snapshot;
   an actual schema rejection or unavailable playback is retained as such.
5. Eleven controlled stats aliases per target: the four paired brackets, explicit ALL,
   omitted bracket, DIVINE_IMMORTAL with time grouping disabled, the same group with
   minTime=maxTime=10, and windows 9–11, 9–10 and 10–11. The original live capture used ALL
   for the last two controls and returned no rows; the corrected queries use a populated group.
   Hero, position, candidate week and remaining grouping parameters stay fixed.
   An omitted bracket is documented as omission, not a GraphQL null argument. Schema or
   selector uncertainty blocks these queries explicitly instead of choosing a fallback.

Requests have the existing 30-second body-inclusive timeout and progress output. Research
requests retain query/variables, timestamps, errors and partial data, without authorization
headers. Only the selected player's playback is exported; no account/profile identifiers
are requested. Unknown options fail before network work.

`captureStatus: complete` means the planned requests returned without the recorded transport,
GraphQL or missing-cohort failures. It does **not** establish metric validity, non-empty
populations or complete playback. Null arrays/events and empty lists remain distinct.
An optional research failure yields a saved `partial` artifact and exit code 1: send that
JSON as well. A failure of the original STRATZ/OpenDota base capture still aborts without
writing a replacement output file; send the terminal error and do not mistake an older
file for a new result. All base targets must finish before the artifact is written.

The owner has supplied both the initial study and the corrected controls (below). This
checkout still has no STRATZ_API_TOKEN or .env.local; live evidence comes from those owner
captures. Node regression/CLI tests use explicitly synthetic responses.

### Questions to answer from the capture

| Question | Evidence to inspect | What it cannot prove alone |
|---|---|---|
| Is raw time 10 the 10:00 boundary? | Argument docs; exact OpenDota ticks; CS and net-worth event times; 0/1 and 9/10/11 rows; equal-bound query | Similar curve shapes or a successful range filter do not establish the average's sample boundary. Do not shift indexes silently. |
| Does CS include neutrals? | Actual event flags against interval/cumulative/final counts, plus raw average cs/neutrals/ancients and descriptions | Actual last-hit semantics do not automatically define average CS. Neutral/ancient flags may overlap; an event with unknown flags is not a lane creep. |
| Which ranks are compared? | Separate explicit bucket responses, ALL/omission, row metadata and counts | A match bracket is not the player's historical rank. A null returned bucket is not ALL. No fabricated fine-rank norms. |
| What do the counters mean? | Per-time and collapsed-time responses with the same filters; descriptions; end-of-match coverage | Equality/decline does not prove inclusion rules, denominators or population completeness. Do not weight averages by an unverified count. |

If provider definitions remain absent, record the unresolved question and concrete examples
for STRATZ support. Do not promise that this experiment will recover hidden methodology.
No support message has been sent. No product grades, benchmark readiness or carry rules
change in this patch. Factual economy and other-role work need not wait on this research.

## Controlled study received (2026-10-01 MSK)

| Artifact | `capturedAt` (UTC) | Bytes | SHA-256 |
|---|---|---:|---|
| `stratz-controlled-study.json` | `2026-09-30T21:48:15.216Z` | 2160774 | `70fc6eb248182d4478ff597b5010aca22abb77ffd06d69bb6060fef5f4252e74` |

The owner supplied this JSON from PR #64. `captureStatus` is complete: schema, clock and
cohort requests returned without HTTP/GraphQL errors. This is request completion, not a
statement that playback or normative methodology is complete. Raw JSON remains outside Git.
All 582 actual-series values match the preceding expanded capture. WK 9019592113's 38
benchmark rows changed again; the other two benchmarks did not. Its raw-time-10 matchCount
is now 8136 (earlier 6564 → 6788 → 6951).

### 1. Live argument descriptions and explicit rank groups

Live HeroStatsQuery.stats introspection confirms the argument descriptions and types that
were previously known only from a third-party schema snapshot. Input week is described as
an epoch timestamp, and minTime/maxTime as in-game minutes. The rank description still
uses numeric 0–8 prose despite the coarse enum. Descriptions of returned time, cs, networth,
matchCount and remainingMatchCount remain null; the argument descriptions do not fill
these gaps.

Each of four explicitly requested rank groups returned 76 rows (raw times 0–75) for each
target. Omitting the rank filter with groupByBracket=true returned 380 rows: 76 each for
UNCALIBRATED and the four paired groups. Explicit `[ALL]` returned an empty list for all
three targets. Omission and ALL are therefore demonstrably different in these requests.

For every available heroAverage row, direct stats with the corresponding returned week,
hero, position and DIVINE_IMMORTAL matched every shared field except bracketBasicIds:
66/66, 38/38 and 30/30 base rows, and the same counts for the 12 shared clock-query fields.
heroAverage's bracket is null while the direct rows identify DIVINE_IMMORTAL. All three
matches report rank=80 and bracket=8; this establishes an empirical cohort match for these
subjects, not the selected player's historical rank or a universal resolver rule.
This observation belongs to the initial study. The later controls below expose contradictory
creep metrics between aliases and do not reproduce all of these direct-query values.

For WK 9019592113, raw time 10 illustrates the rank effect:

| Requested group | cs | networth | matchCount |
|---|---:|---:|---:|
| HERALD_GUARDIAN | 33.68 | 3136.67 | 6160 |
| CRUSADER_ARCHON | 38.48 | 3345.00 | 23514 |
| LEGEND_ANCIENT | 41.47 | 3471.31 | 31012 |
| DIVINE_IMMORTAL | 44.30 | 3606.61 | 8136 |

This is a research comparison at **raw time 10**, not a verified 10:00 target or player grade.

### 2. Actual clock and creep-event coverage

Lifestealer playbackData is null; do not infer zero creep events or missing farm from it.
Both WK playbacks have CS event counts equal to final last hits: 302 and 281. Every flag
was a Boolean, but some events have all three category flags false. Identical selected-field
records can represent simultaneous kills of identical NPC types; do not deduplicate them.

| Target | isCreep only | isNeutral only | isAncient only | All three false | Total |
|---|---:|---:|---:|---:|---:|
| 9019592113 | 117 | 140 | 1 | 44 | 302 |
| 9003795847 | 163 | 76 | 9 | 33 | 281 |

No overlapping flags were observed in these two event streams. That does not establish
that flags are mutually exclusive in every match. The flagged totals differ from OpenDota's
lane/neutral/ancient kill counters (124/174/4 and 164/102/9); they are not interchangeable
category definitions. Unflagged events must remain unclassified.

At 600 seconds, WK 9019592113 has 51 events: 43 isCreep and eight isNeutral. WK 9003795847
has 52 events: 48 isCreep, three isNeutral and one unflagged. Thus actual LH at ten minutes
includes flagged neutrals and cannot be labelled lane-creep-only. Average cs equivalence
and the meaning of average neutrals/ancients remain unproven.

OpenDota times are 0,60,... for all three targets. Counting CS events strictly before each
recorded tick matches WK 9019592113 at all 38 ticks, and WK 9003795847 at 29/30; the latter
has a one-event difference at 660s. Including events exactly at the tick matches only 29/38
and 25/30. Preserve this observation and boundary uncertainty instead of rounding events
or discarding the mismatch.

STRATZ networthPerMinute[i] matches playerUpdateGoldEvents at time=i*60 for every exported
WK element: 38/38 and 30/30. Both start at networth=600 at time 0. This validates the actual
series on these two subjects, not heroAverage's clock or definition. OpenDota networth_t is
unavailable and is not replaced by cumulative collected gold.

### 3. Average clock and week limitations

Average raw time 0 networth is 127.77 / 161.63 / 154.36, while raw time 1 is
606.51 / 611.16 / 608.80. The small cs at raw time 1 and following values support a clock
or initial-state hypothesis, but do not prove an offset. Never silently map raw time 10 to
10:00 or subtract one without a confirmed contract.

| Target | Match start UTC | floor(start/604800) | Returned average week |
|---|---|---:|---:|
| 8781054570 | 2026-04-21 22:32:49 | 2937 | 2937 |
| 9019592113 | 2026-09-27 22:12:49 | 2960 | 2960 |
| 9003795847 | 2026-09-17 21:09:56 | 2959 | 2958 |

The third row contradicts using floor(matchStart/604800) as a universal week selector.
Passing the *returned* week multiplied by 604800 reproduced each target's curve; it does
not prove Thursday-based provider week boundaries or why the selected week differs from
this date calculation. Timezone, period boundaries and selection/fallback behavior remain
unconfirmed. The candidate UTC intervals above are arithmetic hypotheses, not established
provider periods.

### 4. Counters and corrected targeted controls

matchCount equals remainingMatchCount in all returned direct rows as well as heroAverage.
Both decrease at later raw times. For DIVINE_IMMORTAL, raw-time-0 → raw-time-75 counts are
20623 → 67, 8136 → 40 and 7766 → 36. Do not turn this into a proved survival/finished-match
filter or assume either value is the averaging denominator.

The original collapsedTime and boundary10 queries both inherited `[ALL]`; their empty
results cannot isolate time grouping or min/max boundaries. The probe now uses the
observed populated DIVINE_IMMORTAL group for both controls and adds adjacent range windows.
ALL remains its own recorded negative control. The additional controls are not a promise
that hidden average-clock or denominator semantics can be recovered without STRATZ definitions.

To avoid recapturing schema, matches, playback and OpenDota, the existing script accepts
`--controls-from`. It reads the original study, validates all three selectors before any
request, and refreshes only stats requests (one HTTP call per target). The output references
the original filename, bytes, SHA-256, capture time and schema time. It does not merge new
values into the old artifact or claim the source schema is a new introspection.

The owner used the following command on the updated PR #64 branch, with the existing token
and working STRATZ access; the resulting capture is analysed below:

```powershell
cd D:\dota-coach
git switch codex/stratz-controlled-cohort-study
git pull --ff-only
node --env-file=.env.local scripts/probe-stratz-hero-average.mjs --controls-from=stratz-controlled-study.json --out=stratz-cohort-controls.json
```

If git reports an error, do not run the new mode from an old checkout. Send the new controls
JSON, including a partial result. No Next.js server is required. Source and output paths
must differ; the input is read unchanged. Product decision remains **C — research-only**.
Actual clock/creep findings can support #34 independently of unresolved average methodology.

## Corrected controls received (2026-10-01 MSK)

| Artifact | `capturedAt` (UTC) | Bytes | SHA-256 |
|---|---|---:|---|
| `stratz-cohort-controls.json` | `2026-09-30T22:34:52.115Z` | 1159577 | `7d6108767f85fc5a9fd6cb78606cd530ca77455e227a189782ad94b13a8a028a` |

The source reference was checked against the original study: filename, bytes, SHA-256,
capture time and schema time match. The two artifact completion times differ by 46 minutes
36.899 seconds; this does not date a provider update. All three controls requests are
captured without recorded HTTP/GraphQL errors, and captureStatus is complete. No new match,
playback, actual series or schema was fetched. Raw files remain outside Git.

### Returned time labels and grouping

For all three targets, the four paired buckets again return 76 rows, omission 380, and
explicit ALL zero. The corrected controls now return data:

| Request | Returned raw time labels, for each target |
|---|---|
| minTime=10, maxTime=10 | 10 |
| minTime=9, maxTime=11 | 9, 10, 11 |
| minTime=9, maxTime=10 | 9, 10 |
| minTime=10, maxTime=11 | 10, 11 |
| groupByTime=false, range 0–75 | One row, time=75 |

Both bounds are included in the returned **raw labels** for these requests. This does not
establish the instant/interval represented by a row or map heroAverage.time=10 to 10:00.
The ungrouped row matches the full DIVINE_IMMORTAL time=75 row in every returned field for
each target, including both counts. It therefore does not establish a pooled population or
the averaging denominator. Never sum counts over time to obtain unique matches.

### Creep metrics disagree within the same HTTP response

Hero, position, input week and the returned DIVINE_IMMORTAL bucket are fixed. At raw time 10,
cs varies by alias/filter range within each target's single response:

| Query variant | LS 8781054570 | WK 9019592113 | WK 9003795847 |
|---|---:|---:|---:|
| Explicit bucket, range 0–75 | 150.67 | 149.81 | 149.88 |
| Omitted bucket filter, returned DIVINE_IMMORTAL row | 42.21 | 44.32 | 44.33 |
| Equal bounds 10–10 | 148.02 | 44.32 | 120.63 |
| Range 9–11 | 132.92 | 44.32 | 149.88 |
| Range 9–10 | 148.02 | 44.32 | 120.63 |
| Range 10–11 | 132.92 | 44.32 | 149.88 |

The variants have different time ranges or rank-filter omission; they are not identical
queries. However, every other returned field except cs/neutrals/ancients agrees at each
overlapping time between the full explicit curve and these controls/omitted DIVINE rows.
This includes networth, week, matchCount, remainingMatchCount and winCount. At raw time 10,
networth is respectively 3485.94 / 3607.81 / 3616.83 and both counts are 20623 / 8224 / 7766
throughout the variants. Ordinary changes between the two captures cannot by themselves
explain discrepancies inside one response.

Across the full curves, explicit versus omitted DIVINE rows differ in cs at 45/76, 75/76
and 75/76 times; neutrals at 43/76, 73/76 and 72/76; ancients at 34/76, 61/76 and 62/76.
For LS and the older WK, the entire omitted response and the other three explicit groups
are unchanged from the original study. Their full explicit DIVINE curves changed only in
these three creep fields after the query composition was expanded. The current-week WK
also changed its counts/economy between captures (raw-time-10 matchCount 8136 → 8224), which
must be kept separate from the within-response discrepancies.

As an arithmetic observation, WK 9019592113's full explicit cs at raw time 10 (149.81)
equals the sum of omitted DIVINE cs at labels 0–9, rounded to two decimals. A similar prefix
pattern occurs over part of the curve, but is not universal across targets or later labels.
It is not a reason to integrate, differentiate or repair cs in the product.

The CLI's captureResearch retains provider body.data without transforming these metrics;
cohortResults only adds alias status and row counts. The anomalies are present in the
stored response rather than an actual-to-average computation in the probe. Aggregation,
caching or shared resolver state are possible explanations, not confirmed diagnoses.
These aliases share one GraphQL request: fixed selectors do not establish independence of
their server execution. Isolated single-field requests and provider definitions would be
needed to separate range semantics from possible alias interactions. No such isolation
result is claimed here, and no alias is selected as the authoritative correction.

### Decision and remaining questions

The corrected query plumbing is live-verified: populated controls, original selectors,
explicit empty ALL and unchanged source provenance are all retained. Transport completion
does not become semantic validation. matchCount and remainingMatchCount are still equal in
all returned rows; their distinction and the denominator remain unknown. goldPerMinute
remains null throughout. Average clock, average CS definition and week selection are not
resolved by this capture.

Decision remains **C — research-only**. The new contradiction is an additional reason to
keep STRATZ average comparisons out of product grades/targets. This patch requires no
further runtime changes or an identical owner recapture. Further benchmark work needs a
separate isolation experiment or explicit STRATZ definitions; repeating this combined
request alone will not establish them. No provider message has been sent.

Ready-to-review provider questions, with the concrete response/query stored in the artifact:

1. What instant or interval do returned time labels represent, including labels 0 and 1?
2. Are cs/neutrals/ancients interval or cumulative values, and which units do they count?
3. Why do overlapping rows with equal networth/counts return different creep metrics,
   especially when explicit, omitted, narrowed and ungrouped aliases share one request?
4. What do matchCount and remainingMatchCount count, and which value is the denominator?
5. How is heroAverage's week selected when it differs from floor(matchStart/604800)?

PR #64 can finish as research tooling/documentation. Factual economy work in #34 can proceed
using the already checked actual series and event limits; it does not require these averages.
