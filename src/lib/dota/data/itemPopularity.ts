import { normalizeItemPopularity } from '../adapters/normalizeBenchmarks';
import { normalizeItemConstants } from '../adapters/normalizeItemConstants';
import { fetchOpenDotaPathResearch } from '../providers/opendotaProvider';

async function loadResearchItemConstants() {
  const [items, itemIds] = await Promise.all([
    fetchOpenDotaPathResearch('/constants/items'),
    fetchOpenDotaPathResearch('/constants/item_ids')
  ]);
  if (items.error || itemIds.error || items.payload === undefined || itemIds.payload === undefined) {
    return { lookup: { itemByKey: {}, itemKeyById: {} }, error: `OpenDota item constants unavailable: ${items.error ?? itemIds.error ?? 'items or item_ids payload missing'}` };
  }

  const normalized = normalizeItemConstants(items.payload, itemIds.payload);
  if (!Object.keys(normalized.itemByKey).length || !Object.keys(normalized.itemKeyById).length) {
    return { lookup: { itemByKey: {}, itemKeyById: {} }, error: 'OpenDota item constants unavailable: items or item_ids payload has no usable entries' };
  }
  return { lookup: normalized, error: undefined };
}

export async function getHeroItemPopularityResearch(heroId: number) {
  const response = await fetchOpenDotaPathResearch(`/heroes/${heroId}/itemPopularity`);
  const constants = response.payload !== undefined ? await loadResearchItemConstants() : undefined;
  const constantsError = constants?.error;
  const normalized = normalizeItemPopularity(heroId, response.payload, constants?.lookup);
  const unavailableReason = response.error
    ?? (!normalized.available ? normalized.errors?.[0] ?? 'OpenDota returned no item popularity data for this hero' : undefined);

  return {
    ...normalized,
    status: response.status,
    contentType: response.contentType,
    requestUrl: response.url,
    ...(unavailableReason ? { unavailableReason } : {}),
    ...(response.rawPreview ? { rawPreview: response.rawPreview } : {}),
    ...(response.error || constantsError
      ? { errors: [...(normalized.errors ?? []), ...(response.error ? [response.error] : []), ...(constantsError ? [`Item constants: ${constantsError}`] : [])] }
      : {})
  };
}
