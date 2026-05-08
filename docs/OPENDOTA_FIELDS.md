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

## Research/debug only

1. **gold_reasons**
- current `constantsAvailable = false`;
- observed raw keys: `0,1,6,11,12,13,14,15,16,17,21`;
- do not productize gold source breakdown until constants are decoded.

2. **death timings**
- unavailable in current match snapshot;
- product UI can only show total deaths when timing/event arrays are absent.
