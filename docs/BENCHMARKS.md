# BENCHMARKS

## Current benchmark status
- lane LH@10 uses `manual_mvp_threshold`; item timings use it only when no usable external timing context is available;
- STRATZ benchmarks are not confirmed;
- OpenDota `/scenarios/itemTimings` is connected as a context-only source with sample-size guardrails;
- OpenDota `/heroes/{hero_id}/itemPopularity` is normalized in research, but is intentionally not used for product popularity claims because its response has counts without cohort/denominator or patch/role dimensions;
- per-match benchmarks must not be used for item timings.

## Future benchmark plan
1. ~~OpenDota `/scenarios/itemTimings` for item timing context.~~ Implemented as context-only with sample-size guardrails; manual thresholds remain the fallback when usable external context is unavailable.
2. ~~OpenDota `/heroes/{hero_id}/itemPopularity` for phase expectations.~~ Closed for the current architecture; research diagnostics remain available, but the source cannot support typical/non-typical wording without cohort and denominator metadata.
3. STRATZ benchmark fields only after schema research confirms exact fields.
