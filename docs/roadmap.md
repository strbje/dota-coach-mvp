# Roadmap checklist sync

## Пункт 4 — item analysis/checkability
- Проверка item analysis выполняется через `POST /api/post-match/analyze`.
- `GET /api/debug/match/:id` остаётся endpoint-ом нормализации OpenDota и не является источником product item-analysis полей.

## Пункт 5 — role/checkability
- Проверка роли выполняется через `POST /api/post-match/analyze`:
  - `analysis.role`
  - `analysis.roleDetection` (в debug summary)

## Следующий research для benchmarks
- проверить OpenDota `/benchmarks` для GPM/XPM/LH/hero damage/tower damage percentiles;
- проверить OpenDota `/heroes/{hero_id}/itemPopularity` для item phase popularity;
- проверить OpenDota `/scenarios/itemTimings` для item timing win-rate buckets;
- проверить STRATZ `heroAverage` как альтернативу hero/position benchmarks.
