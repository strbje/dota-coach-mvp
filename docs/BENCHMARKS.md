# BENCHMARKS

## Current benchmark status
- lane LH@10 and item timings currently use `manual_mvp_threshold`;
- STRATZ benchmarks are not confirmed;
- OpenDota `/scenarios/itemTimings` is not implemented yet;
- OpenDota `/heroes/{hero_id}/itemPopularity` is not implemented yet;
- per-match benchmarks must not be used for item timings.

## Future benchmark plan
1. OpenDota `/scenarios/itemTimings` for item timing windows.
2. OpenDota `/heroes/{hero_id}/itemPopularity` for phase expectations.
3. STRATZ benchmark fields only after schema research confirms exact fields.
