export type OpenDotaItemBenchmarkSource =
  | 'opendota_scenarios'
  | 'opendota_item_popularity'
  | 'manual_mvp_threshold'
  | 'unavailable';

export async function fetchHeroItemTimings(_heroId: number) {
  void _heroId;
  // TODO(next): wire OpenDota /scenarios/itemTimings for hero-level timing percentiles.
  return null;
}

export async function fetchHeroItemPopularity(_heroId: number) {
  void _heroId;
  // TODO(next): wire OpenDota /heroes/{hero_id}/itemPopularity for build-phase expectations.
  return null;
}
