# OPENDOTA_FIELDS

## Product-ready normalized fields

1. **itemTimings**
- source: `purchase_log`
- example: Phase Boots 6:29, Armlet 13:22, Desolator 18:26
- reliable when `purchase_log` exists.

2. **economyByPhase**
- source: `gold_t` / `lh_t` / `xp_t`
- fields:
  - `goldPerMinuteInPhase`
  - `lhPerMinuteInPhase`
  - `xpPerMinuteInPhase`
- product use: phase economy and farm tempo.

3. **laneReview**
- source: `lane_efficiency` / `lane_efficiency_pct` / `lh_t` / `gold_t`
- fields:
  - `laneEfficiencyPct`
  - `lhAt10`
  - `goldAt10`
- product use: lane review.

4. **farmProfile**
- source: `lane_kills`, `neutral_kills`, `ancient_kills`, `hero_kills`, `tower_kills`, `roshan_kills`
- important: kill-count profile, not gold-source breakdown.

5. **objectiveEvents**
- source: `objectives`
- product use only after type translation and cautious team attribution.
- raw objective types must not be shown in product UI.

## Partial / guarded product use

1. **Economy source breakdown**

Verified on 2026-10-23 against independent primary data, not by comparing two consumers of our own table:

- [OpenDota web translations](https://github.com/odota/web/blob/3e872e889b8ec87255cff1f81ed5ad7b304b0144/src/lang/en-US.json), blob `12689dec052d31e0b220e0b3a77d00eda9132ea0`. The courier translation is **`NULL_gold_reasons_16`**, item sales are `NULL_gold_reasons_6`; the prefix does not make the match value unavailable.
- [Valve game enum `EDOTA_ModifyGold_Reason`, extracted in GameTracking-Dota2](https://github.com/SteamTracking/GameTracking-Dota2/blob/d50f4d992e5b58d037b1da2de759cd7e1a2128d4/DumpSource2/schemas/client/EDOTA_ModifyGold_Reason.h), blob `3eb0dcd14e08ea2d3441cd5c6af068c6b0e24f9c`. This is an extracted game schema, not a manually inferred translation table.

| ID | Confirmed meaning | Product category |
| --- | --- | --- |
| 1 | Death | Потери при смерти |
| 2 | Buyback | Выкуп |
| 6 | SellItem | Продажа предметов |
| 11 | Building | Строения |
| 12 | HeroKill | Герои |
| 13 | CreepKill | Крипы |
| 14 | NeutralKill | Нейтралы |
| 15 | RoshanKill | Рошан |
| 16 | CourierKill | Курьеры |
| 17 | BountyRune | Руны богатства |
| 19 | AbilityGold | Способности |
| 20 | WardKill | Варды |
| 21 | CourierKilledByThisPlayer | Личная награда за курьера |

Every old fallback entry was rechecked. In particular, 19 is **not buyback** and 20 is **not abandon**. Key 21 is deliberately separate from 16: the Lifestealer control retains **305** for couriers and **155** for the personal courier reward; it does not silently become 460. The enum confirms key 6 independently of its amount. Key 0 is `Unspecified` / `Other`, not proof of starting gold; it remains product-unknown. IDs outside the reviewed table also remain unknown, even if a provider label contains a familiar keyword. Further semantic coverage is separate research.

The provider owns the verified ID table; debug and product use `normalizeGoldReasons`. Unavailable constants (the live endpoint returned HTTP 404) use the verified fallback. Remote labels cannot overwrite verified ID semantics or create product categories by substring guessing.

`raw` preserves received values, `decoded` retains finite numeric entries including confirmed zero, and `invalidKeys` records unusable values. `grouped` keeps positive, negative and zero buckets separately for each category, including unknown. The legacy `unknownAmount` field is a signed debug net amount only; UI uses the separate buckets, so opposite unknown sums cannot disappear. Losses keep their original sign and magnitude.

`breakdownComplete` only describes decoding of **received** entries, never completeness of all match gold. Unknown or invalid entries make it false. Neither sums nor gold timelines substitute for net worth. Missing/non-numeric values do not become zero. The kill-count profile remains available and is not presented as gold.

Control results, live limitations and owner commands: [verification/gold-reasons.md](verification/gold-reasons.md).

## Research/debug only

1. **death timings**
- unavailable in current match snapshot;
- product UI can only show total deaths when timing/event arrays are absent.
