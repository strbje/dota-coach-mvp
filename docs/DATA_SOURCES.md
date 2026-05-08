# DATA_SOURCES

## OpenDota (основной источник MVP)
- Основной provider для post-match payload.
- Используем: `purchase_log`, item slots/timings, `lane_efficiency`, `lane_efficiency_pct`, `lh_t`, `gold_t`, `xp_t`, `gold_reasons`, `lane_kills`, `neutral_kills`, `ancient_kills`, `hero_kills`, `objectives`, `teamfights` (если есть), match `benchmarks`.
- Match benchmarks применять для GPM/XPM/LH-per-min/hero-damage-per-min и похожих метрик.
- Не использовать per-match benchmarks для item timings.

## OpenDota constants
- Endpoint: `/constants/{resource}`.
- Fallback: dotaconstants mirror.
- Применение: hero IDs, item IDs, `gold_reasons` и другие enum/lookup значения.

## STRATZ (future/advanced)
- GraphQL API.
- Потенциальные данные: replay/playback, fight, death location, pathing, richer farm context.
- Точные поля валидируем через GraphQL Explorer + token.

## Manual MVP thresholds
- Временные пороги, только когда нет benchmark из OpenDota/STRATZ.
- В UI использовать формулировку: **«по MVP-ориентиру»**, не «официальный benchmark».
