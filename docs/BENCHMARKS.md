# BENCHMARKS

1. **manual_mvp_threshold**  
   Временные ручные пороги. В UI: «по MVP-ориентиру».

2. **opendota_match_benchmarks**  
   Для GPM, XPM, kills/min, last_hits/min, hero_damage/min, tower damage и похожих матчевых метрик.  
   Не использовать для item timings.

3. **opendota_scenarios_item_timings** (future)  
   Endpoint: `/scenarios/itemTimings` для hero-specific timing windows.

4. **opendota_item_popularity** (future)  
   Endpoint: `/heroes/{hero_id}/itemPopularity` для ожиданий по фазам start/early/mid/late.

5. **stratz** (future)  
   Для richer role/hero/player benchmarks после валидации полей.
