# ANALYTICS_METHODOLOGY

1. Каждый вывод должен иметь: **metric**, **source**, **confidence**, **limitation** (если есть).
2. Raw provider fields не показываем в product UI.
3. Типы источников: `opendota_match`, `opendota_constants`, `opendota_benchmarks`, `opendota_scenarios`, `stratz_graphql`, `manual_mvp_threshold`.

## Что можно утверждать
- «Armlet куплен на 13:22» — если есть `purchase_log`.
- «760 GPM» — если есть `gold_per_min`.
- «45 LH на 10:00» — если есть `lh_t`.
- «Умер первым в драке» — только при наличии teamfight/death-order data.
- «Умер в опасной зоне карты» — только при наличии death coordinates/position data.
- «Золото с нейтралов» — только после decoded `gold_reasons`.

## Что нельзя утверждать
- solo death без событийного контекста;
- first death без порядка смертей в fight;
- death location без координат;
- плохой вижен без ward/map context;
- источники золота без decode `gold_reasons`.
