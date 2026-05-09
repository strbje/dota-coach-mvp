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
