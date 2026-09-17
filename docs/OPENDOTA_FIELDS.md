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
- confirmed ids are normalized into separate lane creeps, neutrals, heroes, buildings, Roshan and courier groups;
- observed ids `0`, `6` and `21` have no confirmed mapping in the current constants/schema research and remain unknown;
- product UI never exposes unknown ids and falls back to the kill-count farm profile whenever unknown reasons make the breakdown incomplete;
- debug and product data use the same grouping function; there is no implicit creeps/neutrals/objectives roll-up.

## Research/debug only

1. **death timings**
- unavailable in current match snapshot;
- product UI can only show total deaths when timing/event arrays are absent.
